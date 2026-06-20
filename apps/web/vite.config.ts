import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const pkg = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@/", replacement: pkg("./src/") },
      { find: "@deepforge/config/market", replacement: pkg("../../packages/config/src/market.ts") },
      { find: "@deepforge/config", replacement: pkg("../../packages/config/src/index.ts") },
      { find: "@deepforge/ir", replacement: pkg("../../packages/ir/src/index.ts") },
      { find: "@deepforge/compiler", replacement: pkg("../../packages/compiler/src/index.ts") },
      { find: "@deepforge/simulator", replacement: pkg("../../packages/simulator/src/index.ts") },
      { find: "@deepforge/risk", replacement: pkg("../../packages/risk/src/index.ts") },
      { find: "@deepforge/predict-sdk", replacement: pkg("../../packages/predict-sdk/src/index.ts") },
    ],
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
});
