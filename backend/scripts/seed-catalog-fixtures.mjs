// Dev-only fixture data for manually testing the catalog/rules endpoints
// (phase 2/3): one sample supplier plus three fabrics that exercise the
// cases those modules actually branch on —
//   - full option support (everything in seed.sql's vocabulary)
//   - partial support (some values missing, so evaluateOptions/
//     isTemplateCompatibleWithFabric have something real to filter)
//   - no option data at all (FR-TPL-10: must stay unavailable)
//
// Not part of backend/supabase/seed.sql because db-setup.mjs skips seed.sql
// entirely once dress_templates has rows (already true on this project), so
// editing it wouldn't actually apply. This is separate and idempotent
// (upserts on the natural unique keys), safe to re-run any time.
//
// Usage: npm run seed:catalog

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, ".env.local") });
dotenv.config({ path: path.join(root, ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Fill NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// Matches the vocabulary seed.sql already inserts (option_groups/option_values).
const FULL_SUPPORT = {
  neckline: ["round", "v-neck", "boat"],
  sleeve: ["full", "three-quarter", "sleeveless"],
  cuff: ["soft", "rolled", "hard"],
  bottom: ["straight", "flared"],
  closure: ["buttons", "zip"],
};

const PARTIAL_SUPPORT = {
  neckline: ["round", "v-neck"],
  sleeve: ["full", "three-quarter"],
  cuff: ["soft", "rolled"], // no "hard" — evaluateOptions should drop it for this fabric
  bottom: ["straight"],
  // no "closure" key at all — isTemplateCompatibleWithFabric should fail any
  // template that needs a closure choice on this fabric
};

async function main() {
  const { data: supplier, error: supplierError } = await admin
    .from("suppliers")
    .upsert({ name: "Khadi", slug: "khadi", status: "active", contact: { email: "ops@khadi.test" } }, { onConflict: "slug" })
    .select("id")
    .single();
  if (supplierError) throw supplierError;
  console.log(`✓ supplier: Khadi (${supplier.id})`);

  const fabrics = [
    {
      external_id: "KH-SLK-114",
      name: "Raw silk, ivory",
      composition: "100% silk",
      properties: { fibre: "silk", weight: "light", drape: "fluid", stretch: "none", opacity: "opaque", directional_pattern: false },
      price_per_metre: 2400,
      stock_metres: 86,
      supported_options: FULL_SUPPORT,
      is_available: true,
      source: "manual",
    },
    {
      external_id: "KH-COT-220",
      name: "Khadi cotton, natural",
      composition: "100% cotton",
      properties: { fibre: "cotton", weight: "medium", drape: "structured", stretch: "none", opacity: "opaque", directional_pattern: true },
      price_per_metre: 900,
      stock_metres: 140,
      supported_options: PARTIAL_SUPPORT,
      is_available: true,
      source: "manual",
    },
    {
      external_id: "KH-UNSYNCED-001",
      name: "Unsynced test fabric",
      composition: null,
      properties: {},
      price_per_metre: 1200,
      stock_metres: 0,
      supported_options: {},
      is_available: false, // FR-TPL-10 — no option data, must not be available
      source: "manual",
    },
  ];

  for (const fabric of fabrics) {
    const { data, error } = await admin
      .from("fabrics")
      .upsert({ supplier_id: supplier.id, ...fabric }, { onConflict: "supplier_id,external_id" })
      .select("id, name, is_available")
      .single();
    if (error) throw error;
    console.log(`✓ fabric: ${data.name} (${data.id}) — is_available=${data.is_available}`);
  }
}

main()
  .then(() => console.log("Catalog fixtures ready."))
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
