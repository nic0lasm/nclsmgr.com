import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = 3100;

// Base de l'espace privé propre à ce lancement : le serveur de test la crée et la migre au
// démarrage, les tests y insèrent leurs liens. Les processus de test héritent du chemin, et
// e2e/nettoyage.ts supprime le dossier temporaire en fin de campagne.
if (!process.env.ESPACE_BASE_E2E) {
  const dossier = mkdtempSync(join(tmpdir(), "nclsmgr-e2e-"));
  process.env.ESPACE_DOSSIER_E2E = dossier;
  process.env.ESPACE_BASE_E2E = join(dossier, "espace.db");
}
const baseEspace = process.env.ESPACE_BASE_E2E;

export default defineConfig({
  testDir: "e2e",
  globalTeardown: "./e2e/nettoyage.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node .next/standalone/server.js",
    url: `http://127.0.0.1:${port}/healthz`,
    env: { PORT: String(port), HOSTNAME: "127.0.0.1", ESPACE_BASE: baseEspace },
    reuseExistingServer: !process.env.CI,
  },
});
