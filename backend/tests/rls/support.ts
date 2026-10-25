// Shared scaffolding for RLS isolation tests (WBS 1.4). RLS is enforced by
// Postgres, so this can't be mocked like modules/users/*.test.ts — it runs
// against the real project configured in .env (same approach as
// tests/auth.mjs), creating throwaway fixtures and deleting them afterwards.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
dotenv.config({ path: path.join(root, ".env.local") });
dotenv.config({ path: path.join(root, ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "Fill NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env to run RLS tests.",
  );
}

export const admin: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });

export function anonClient(): SupabaseClient {
  return createClient(url!, anonKey!, { auth: { persistSession: false } });
}

const stamp = Date.now();
export function uniqueSlug(tag: string) {
  return `${tag}-${stamp}-${Math.random().toString(36).slice(2, 7)}`;
}

const cleanupUserIds: string[] = [];
const cleanupSupplierIds: string[] = [];

// Creates a confirmed auth user with the given role already set (bypassing
// RLS via the service-role client, mirroring what handle_new_user +
// inviteUser's fix-up do together in the real app).
export async function createUserWithRole(
  role: "customer" | "agent" | "tailor" | "qc" | "dispatch" | "supplier_contact" | "admin",
  tag: string,
) {
  const email = `multife-rls-${uniqueSlug(tag)}@multife-test.local`;
  const password = "Sup3rSecret!";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: tag },
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  const userId = data.user.id;
  cleanupUserIds.push(userId);

  if (role !== "customer") {
    const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", userId);
    if (roleError) throw roleError;
  }

  return { userId, email, password };
}

// Signs in as the given fixture and returns a client scoped to that session
// (subject to RLS), matching how a real request would read data.
export async function signedInClient(fixture: { email: string; password: string }) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword(fixture);
  if (error) throw error;
  return client;
}

export async function createAgent(tag: string) {
  const user = await createUserWithRole("agent", tag);
  const { data, error } = await admin
    .from("agents")
    .insert({ profile_id: user.userId, code: uniqueSlug("AG").toUpperCase() })
    .select("id")
    .single();
  if (error) throw error;
  return { ...user, agentId: data.id as string };
}

export async function assignCustomerToAgent(agentId: string, customerId: string) {
  const { error } = await admin.from("agent_customers").insert({ agent_id: agentId, customer_id: customerId });
  if (error) throw error;
}

export async function createSupplier(tag: string, status: "pending" | "active" | "suspended") {
  // suppliers.slug must be lowercase-hyphen (suppliers_slug_check); `tag` is
  // a human-readable label and may contain spaces/uppercase.
  const slug = uniqueSlug(tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-+|-+$/g, "");
  const { data, error } = await admin.from("suppliers").insert({ name: tag, slug, status }).select("id").single();
  if (error) throw error;
  const supplierId = data.id as string;
  cleanupSupplierIds.push(supplierId);
  return supplierId;
}

export async function createSupplierContact(tag: string, supplierId: string) {
  const user = await createUserWithRole("supplier_contact", tag);
  const { error } = await admin.from("supplier_contacts").insert({ supplier_id: supplierId, user_id: user.userId });
  if (error) throw error;
  return user;
}

export async function cleanupAll() {
  for (const id of cleanupUserIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {}); // cascades profiles/agents/agent_customers/supplier_contacts
  }
  for (const id of cleanupSupplierIds) {
    try {
      await admin.from("suppliers").delete().eq("id", id);
    } catch {
      // best-effort cleanup
    }
  }
}
