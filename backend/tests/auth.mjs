// Local regression script for the registration/login/invite flow (NOT a unit
// test of backend/modules/users/*.ts — those are TypeScript with extensionless
// relative imports, which Node's native TS support can't resolve without a
// loader, so this mirrors the same Supabase calls directly, matching the
// dependency-free style of db-check.mjs / create-admin.mjs).
//
// Exercises, against the real project in .env: sign-up, sign-in (incl. wrong
// password and suspended account), sign-out, password-reset request, and the
// invite flow for all 6 invite-only roles. Everything it creates is deleted
// at the end, even on failure.
//
// Usage: npm run test:auth
// Invite-flow checks only run if TEST_INVITE_EMAIL_BASE is set in .env (they
// send a real email via Supabase's inviteUserByEmail, which Supabase's mailer
// rejects for placeholder domains like test.com/example.com — use a real
// inbox, e.g. you+multife@gmail.com, and Gmail's +alias will file them for you).

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, ".env.local") });
dotenv.config({ path: path.join(root, ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Fill NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const stamp = Date.now();

let failed = false;
const cleanupUserIds = [];
const cleanupSupplierIds = [];

async function check(label, fn) {
  try {
    const detail = await fn();
    console.log(`✓ ${label}${detail ? `: ${detail}` : ""}`);
  } catch (err) {
    const message = err.message ?? String(err);
    // Supabase's built-in mailer (no custom SMTP/Resend wired in yet) has a
    // strict per-project send rate limit — hitting it is an environment
    // constraint, not a regression, so skip rather than fail the run.
    if (message.toLowerCase().includes("rate limit")) {
      console.log(`… ${label}: skipped (${message})`);
      return;
    }
    failed = true;
    console.error(`✗ ${label}: ${message}`);
  }
}

function freshAnonClient() {
  // A new client per sign-in so sessions from different fixtures don't leak
  // into each other (mirrors a fresh request in the real app).
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

async function createConfirmedUser(email, password, fullName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  cleanupUserIds.push(data.user.id);
  return data.user.id;
}

// Mirrors signInWithPassword (backend/modules/users/signIn.ts): sign in, then
// check profiles.status, matching the FR-AUTH-06 "suspended can't sign in" rule.
async function signInWithPassword(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("invalid_credentials");

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, role, status")
    .eq("id", data.user.id)
    .single();
  if (profileError || !profile) throw new Error("invalid_credentials");

  if (profile.status === "suspended") {
    await client.auth.signOut();
    throw new Error("account_suspended");
  }
  return profile;
}

// Mirrors inviteUser (backend/modules/users/inviteUser.ts): invite, then patch
// role + the role's linking row + app_metadata.
async function inviteRole(role, email, fullName, extra = {}) {
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
  });
  if (inviteError || !invited.user) throw inviteError ?? new Error("invite returned no user");
  const userId = invited.user.id;
  cleanupUserIds.push(userId);

  const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (roleError) throw roleError;

  if (role === "agent") {
    const { error } = await admin.from("agents").insert({
      profile_id: userId,
      code: extra.agentCode ?? `AG-TEST-${stamp}`,
      region: extra.region ?? null,
    });
    if (error) throw error;
  } else if (role === "supplier_contact") {
    const { error } = await admin.from("supplier_contacts").insert({
      supplier_id: extra.supplierId,
      user_id: userId,
    });
    if (error) throw error;
  }

  const appMetadata = role === "supplier_contact" ? { role, supplier_id: extra.supplierId } : { role };
  const { error: metaError } = await admin.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
  if (metaError) throw metaError;

  return userId;
}

async function main() {
  // --- sign-up (self-serve customer) ---
  await check("sign-up creates a customer", async () => {
    const email = `multife-test-signup-${stamp}@multife-test.local`;
    const client = freshAnonClient();
    const { data, error } = await client.auth.signUp({
      email,
      password: "Sup3rSecret!",
      options: { data: { full_name: "Signup Test" } },
    });
    if (error || !data.user) throw error ?? new Error("no user returned");
    cleanupUserIds.push(data.user.id);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();
    if (profileError || !profile) throw profileError ?? new Error("profile not created");
    if (profile.role !== "customer") throw new Error(`expected role=customer, got ${profile.role}`);
    return "role=customer";
  });

  // --- sign-in: correct password, wrong password, suspended ---
  const fixtureEmail = `multife-test-signin-${stamp}@multife-test.local`;
  const fixturePassword = "Sup3rSecret!";
  let fixtureUserId;

  await check("fixture user created for sign-in checks", async () => {
    fixtureUserId = await createConfirmedUser(fixtureEmail, fixturePassword, "Signin Test");
    return fixtureUserId;
  });

  await check("sign-in with correct password succeeds", async () => {
    const profile = await signInWithPassword(freshAnonClient(), fixtureEmail, fixturePassword);
    if (profile.role !== "customer") throw new Error(`expected role=customer, got ${profile.role}`);
  });

  await check("sign-in with wrong password is rejected", async () => {
    let threw = false;
    try {
      await signInWithPassword(freshAnonClient(), fixtureEmail, "wrong-password");
    } catch (err) {
      threw = err.message === "invalid_credentials";
    }
    if (!threw) throw new Error("expected invalid_credentials");
  });

  await check("suspended account is rejected at sign-in", async () => {
    const { error } = await admin.from("profiles").update({ status: "suspended" }).eq("id", fixtureUserId);
    if (error) throw error;
    let threw = false;
    try {
      await signInWithPassword(freshAnonClient(), fixtureEmail, fixturePassword);
    } catch (err) {
      threw = err.message === "account_suspended";
    }
    if (!threw) throw new Error("expected account_suspended");
  });

  await check("password-reset request does not throw", async () => {
    const { error } = await freshAnonClient().auth.resetPasswordForEmail(fixtureEmail, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    });
    if (error) throw error;
  });

  // --- invite flow (opt-in: sends a real email) ---
  const inviteBase = process.env.TEST_INVITE_EMAIL_BASE;
  if (!inviteBase || !inviteBase.includes("@")) {
    console.log("… skipping invite-flow checks (set TEST_INVITE_EMAIL_BASE in .env to run them)");
  } else {
    const [local, domain] = inviteBase.split("@");
    const aliasFor = (tag) => `${local}+${tag}-${stamp}@${domain}`;

    for (const role of ["admin", "agent", "tailor", "qc", "dispatch"]) {
      await check(`invite: ${role} gets role + app_metadata`, async () => {
        const userId = await inviteRole(role, aliasFor(role), `Test ${role}`);
        const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).single();
        if (profile?.role !== role) throw new Error(`expected role=${role}, got ${profile?.role}`);
        const { data: authUser } = await admin.auth.admin.getUserById(userId);
        if (authUser.user.app_metadata?.role !== role) throw new Error("app_metadata.role not patched");
        if (role === "agent") {
          const { data: agent } = await admin.from("agents").select("id").eq("profile_id", userId).maybeSingle();
          if (!agent) throw new Error("agents linking row not created");
        }
      });
    }

    let supplierId;
    await check("throwaway supplier created for supplier_contact invite", async () => {
      const { data, error } = await admin
        .from("suppliers")
        .insert({ name: "Test Supplier", slug: `test-supplier-${stamp}` })
        .select("id")
        .single();
      if (error) throw error;
      supplierId = data.id;
      cleanupSupplierIds.push(supplierId);
      return supplierId;
    });

    await check("invite: supplier_contact gets role + linking row + supplier_id claim", async () => {
      const userId = await inviteRole("supplier_contact", aliasFor("supplier-contact"), "Test Supplier Contact", {
        supplierId,
      });
      const { data: contact } = await admin
        .from("supplier_contacts")
        .select("supplier_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (contact?.supplier_id !== supplierId) throw new Error("supplier_contacts linking row not created correctly");
      const { data: authUser } = await admin.auth.admin.getUserById(userId);
      if (authUser.user.app_metadata?.supplier_id !== supplierId) throw new Error("app_metadata.supplier_id not patched");
    });

    await check("invite: supplier_contact without a real supplierId is rejected", async () => {
      let threw = false;
      try {
        await inviteRole("supplier_contact", aliasFor("supplier-contact-bad"), "Should Fail", {
          supplierId: "00000000-0000-0000-0000-000000000000",
        });
      } catch {
        threw = true; // FK violation on supplier_contacts.supplier_id
      }
      if (!threw) throw new Error("expected a foreign key violation");
    });
  }
}

async function cleanup() {
  for (const id of cleanupUserIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {}); // cascades profiles/agents/supplier_contacts
  }
  for (const id of cleanupSupplierIds) {
    await admin.from("suppliers").delete().eq("id", id).catch(() => {});
  }
}

main()
  .catch((err) => {
    failed = true;
    console.error("Unexpected failure:", err);
  })
  .finally(async () => {
    await cleanup();
    console.log(failed ? "\nFAILED" : "\nAll checks passed.");
    process.exitCode = failed ? 1 : 0;
  });
