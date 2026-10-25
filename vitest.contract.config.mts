import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Teste de contrato contra a Meta real. Fora do CI; lê .env.local. Uso: npm run test:meta-contract
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/contract/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    env: loadEnv("", process.cwd(), ""),
  },
});
