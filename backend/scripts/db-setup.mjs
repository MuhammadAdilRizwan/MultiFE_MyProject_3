// Creates the MultiFe database on your Supabase project.
// Applies every file in backend/supabase/migrations (in order) and then backend/supabase/seed.sql.
// Applied migrations are recorded in supabase_migrations.schema_migrations — the same
// table the Supabase CLI uses — so re-running is safe and `supabase db push` stays in sync.
//
// Usage: npm run db:setup            (migrations + seed)
//        npm run db:setup -- --no-seed

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, ".env.local") });
dotenv.config({ path: path.join(root, ".env") });

const url = process.env.DATABASE_URL;
if (!url || url.includes("[YOUR-PASSWORD]")) {
  console.error("DATABASE_URL is missing in .env.local (Dashboard → Connect → Session pooler).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log("Connected to Supabase Postgres.");

  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version    text primary key,
      statements text[],
      name       text
    );
  `);

  const dir = path.join(root, "backend", "supabase", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query("select version from supabase_migrations.schema_migrations");
  const applied = new Set(rows.map((r) => r.version));

  for (const file of files) {
    const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
    if (applied.has(version)) {
      console.log(`✓ ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(path.join(dir, file), "utf8");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, statements, name) values ($1, $2, $3)",
        [version, [sql], rest.join("_")],
      );
      await client.query("commit");
      console.log(`✓ ${file} applied`);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`${file} failed, nothing from it was applied: ${err.message}`);
    }
  }

  if (process.argv.includes("--no-seed")) return;

  const { rows: seeded } = await client.query("select count(*)::int as n from public.dress_templates");
  if (seeded[0].n > 0) {
    console.log("✓ seed.sql (data already present, skipped)");
    return;
  }
  const seed = await readFile(path.join(root, "backend", "supabase", "seed.sql"), "utf8");
  try {
    await client.query("begin");
    await client.query(seed);
    await client.query("commit");
    console.log("✓ seed.sql applied");
  } catch (err) {
    await client.query("rollback");
    throw new Error(`seed.sql failed, nothing from it was applied: ${err.message}`);
  }
}

main()
  .then(() => console.log("Database is ready."))
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
