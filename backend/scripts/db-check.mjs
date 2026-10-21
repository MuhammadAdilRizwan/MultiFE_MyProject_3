// Checks that the app can reach Supabase with the keys in .env.local
// and that the schema is in place. Usage: npm run db:check

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
  console.error("Fill NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

let failed = false;
const check = async (label, fn) => {
  try {
    console.log(`✓ ${label}: ${await fn()}`);
  } catch (err) {
    failed = true;
    console.error(`✗ ${label}: ${err.message}`);
  }
};

// Public (anon) key: what a guest on the storefront can see, with RLS applied.
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
await check("anon key reads categories", async () => {
  const { data, error } = await anon.from("categories").select("name");
  if (error) throw error;
  return `${data.length} categories`;
});
await check("RLS hides orders from guests", async () => {
  const { data, error } = await anon.from("orders").select("id");
  if (error) throw error;
  if (data.length) throw new Error(`guest can see ${data.length} orders`);
  return "0 rows visible";
});

// Service-role key: server-only access, bypasses RLS.
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
await check("service key reads tables", async () => {
  const tables = ["profiles", "shops", "products", "orders", "notification_templates"];
  const counts = [];
  for (const t of tables) {
    const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
    if (error) throw new Error(`${t}: ${error.message}`);
    counts.push(`${t}=${count}`);
  }
  return counts.join(", ");
});
await check("storage buckets", async () => {
  const { data, error } = await admin.storage.listBuckets();
  if (error) throw error;
  return data.map((b) => b.id).join(", ");
});

process.exitCode = failed ? 1 : 0;
