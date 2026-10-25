import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    env: {
      // Read at module-eval time by app/(auth)/actions.ts; harmless elsewhere.
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    },
  },
});
