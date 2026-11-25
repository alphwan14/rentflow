import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "supabase/tests/**/*.test.ts"],
    environment: "node",
    // PGlite boots a full Postgres in WASM; the DB suites need a little longer.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
