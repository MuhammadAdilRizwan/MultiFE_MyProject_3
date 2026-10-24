// Creates the first admin account directly via the Auth admin API.
//
// `app_metadata` passed to `admin.createUser` isn't visible to the
// `handle_new_user` trigger at insert time (GoTrue applies it a step after
// the row is created), so the trigger always seeds the profile as
// 'customer'. This script patches `profiles.role` to 'admin' right after,
// the same fix-up the invite flow uses for the same reason.
//
// Usage: npm run create-admin -- --email=admin@example.com --password=... --full-name="Admin"

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, ".env.local") });
dotenv.config({ path: path.join(root, ".env") });

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  }),
);

const email = args.email;
const password = args.password;
const fullName = args["full-name"];

async function main() {
  if (!email || !password) {
    console.error('Usage: npm run create-admin -- --email=admin@example.com --password=... [--full-name="Admin"]');
    process.exitCode = 1;
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("Fill NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    process.exitCode = 1;
    return;
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (error) {
    console.error(`Could not create the admin account: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const { error: roleError } = await admin.from("profiles").update({ role: "admin" }).eq("id", data.user.id);

  if (roleError) {
    await admin.auth.admin.deleteUser(data.user.id);
    console.error(`Created the auth user but failed to set role=admin, rolled back: ${roleError.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✓ Admin account created: ${data.user.id} <${email}>`);
}

await main();
