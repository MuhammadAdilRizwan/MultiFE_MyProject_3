import { configDefaults, defineConfig } from "vitest/config";

// RLS tests hit the real Supabase project in .env (no mocks possible for
// Postgres RLS) — kept out of the default fast/networkless `npm test` run,
// same way tests/auth.mjs is its own opt-in script. Run them with
// `npm run test:rls`.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "tests/rls/**"],
  },
});
