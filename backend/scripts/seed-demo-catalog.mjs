// Loads the demo catalogue (scripts/demo-catalog.mjs) into the database:
//   1. the full customization vocabulary (option_groups / option_values),
//      keyed exactly like frontend/lib/customization.ts;
//   2. seven dress templates with their offered options, extras, measurement
//      fields and yardage formulas;
//   3. eight demo brands, each with six fabrics, a photo per fabric and the
//      options that fabric supports.
//
// PLACEHOLDER DATA — agreed with the client until real store APIs exist.
// Idempotent: upserts on natural keys, safe to re-run. Any non-demo fabric
// under a demo brand (e.g. `npm run seed:catalog` test fixtures) is hidden
// from the storefront so the demo stays consistent; nothing is deleted.
//
// Usage: npm run seed:demo

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  BRANDS,
  DEMO_PREFIX,
  OPTION_EXTRAS,
  TEMPLATES,
  fabricImagePath,
  supportedOptionsFor,
  vocabulary,
} from "./demo-catalog.mjs";

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

function check(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function seedVocabulary() {
  const { data: groups, error } = await admin
    .from("option_groups")
    .upsert(vocabulary.map((g, i) => ({ key: g.key, label: g.label, sort: i + 1 })), { onConflict: "key" })
    .select("id, key");
  check(error, "option groups");
  const groupId = new Map(groups.map((g) => [g.key, g.id]));

  const values = vocabulary.flatMap((g) =>
    g.values.map((v, i) => ({ group_id: groupId.get(g.key), key: v.key, label: v.label, sort: i + 1 })),
  );
  const { data: rows, error: valuesError } = await admin
    .from("option_values")
    .upsert(values, { onConflict: "group_id,key" })
    .select("id, group_id, key");
  check(valuesError, "option values");

  const valueId = new Map(rows.map((v) => [`${v.group_id}|${v.key}`, v.id]));
  console.log(`✓ vocabulary: ${groups.length} groups, ${rows.length} values`);
  return { groupId, valueId };
}

async function seedTemplates({ groupId, valueId }) {
  for (const t of TEMPLATES) {
    const { data: template, error } = await admin
      .from("dress_templates")
      .upsert(
        {
          slug: t.slug,
          name: t.name,
          description: t.description,
          base_stitch_price: t.base_stitch_price,
          lead_days: t.lead_days,
          required_measurements: t.measurements,
          recommended_options: t.recommended,
          yardage_formula: t.yardage,
          is_published: true,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    check(error, `template ${t.slug}`);

    // Replace the offered options wholesale so edits to the demo data apply
    // on re-run. Drafts and orders store option keys, not these rows.
    const { error: deleteError } = await admin.from("template_options").delete().eq("template_id", template.id);
    check(deleteError, `clear options of ${t.slug}`);

    const options = t.groups.flatMap((groupKey) => {
      const group = vocabulary.find((g) => g.key === groupKey);
      return group.values.map((v) => {
        const [priceDelta, extraDays] = OPTION_EXTRAS[groupKey]?.[v.key] ?? [0, 0];
        return {
          template_id: template.id,
          group_id: groupId.get(groupKey),
          value_id: valueId.get(`${groupId.get(groupKey)}|${v.key}`),
          price_delta: priceDelta,
          extra_lead_days: extraDays,
          is_default: v.key === group.defaultKey,
        };
      });
    });
    const { error: insertError } = await admin.from("template_options").insert(options);
    check(insertError, `options of ${t.slug}`);
    console.log(`✓ template: ${t.name} (${options.length} options)`);
  }
}

async function seedBrands() {
  const now = new Date().toISOString();
  for (const brand of BRANDS) {
    const { data: supplier, error } = await admin
      .from("suppliers")
      .upsert({ slug: brand.slug, name: brand.name, status: "active", brand_color: brand.color }, { onConflict: "slug" })
      .select("id")
      .single();
    check(error, `brand ${brand.slug}`);

    const { data: fabrics, error: fabricsError } = await admin
      .from("fabrics")
      .upsert(
        brand.fabrics.map((fab) => ({
          supplier_id: supplier.id,
          external_id: `${DEMO_PREFIX}${fab.code}`,
          name: fab.name,
          composition: fab.composition,
          properties: fab.properties,
          price_per_metre: fab.price,
          stock_metres: fab.stock,
          supported_options: supportedOptionsFor(fab.limits),
          is_available: true,
          is_hidden: false,
          source: "manual",
          last_synced_at: now,
        })),
        { onConflict: "supplier_id,external_id" },
      )
      .select("id, external_id");
    check(fabricsError, `fabrics of ${brand.slug}`);

    const ids = fabrics.map((row) => row.id);
    const { error: clearImagesError } = await admin.from("fabric_images").delete().in("fabric_id", ids);
    check(clearImagesError, `clear images of ${brand.slug}`);
    const { error: imagesError } = await admin.from("fabric_images").insert(
      fabrics.map((row) => ({
        fabric_id: row.id,
        url: fabricImagePath(row.external_id.slice(DEMO_PREFIX.length)),
        sort: 0,
      })),
    );
    check(imagesError, `images of ${brand.slug}`);

    // Keep the demo store consistent: hide anything under this brand that
    // isn't demo data (test fixtures). Admins can unhide them.
    const { data: hidden, error: hideError } = await admin
      .from("fabrics")
      .update({ is_hidden: true })
      .eq("supplier_id", supplier.id)
      .eq("is_hidden", false)
      .not("external_id", "like", `${DEMO_PREFIX}%`)
      .select("id");
    check(hideError, `hide fixtures of ${brand.slug}`);

    const note = hidden.length > 0 ? ` (hid ${hidden.length} non-demo fabric${hidden.length === 1 ? "" : "s"})` : "";
    console.log(`✓ brand: ${brand.name} — ${fabrics.length} fabrics${note}`);
  }
}

async function main() {
  const ids = await seedVocabulary();
  await seedTemplates(ids);
  await seedBrands();
}

main()
  .then(() => console.log("Demo catalogue ready."))
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
