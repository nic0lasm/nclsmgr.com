import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": src("./src"),
      // Hors de Next, « server-only » lèverait une erreur : les tests tournent côté serveur.
      "server-only": src("./node_modules/server-only/empty.js"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
