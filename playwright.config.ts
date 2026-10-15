import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = 3100;
// Second serveur, identique mais sans prive.json : les blocs privés doivent y être masqués.
const portSansPrive = 3101;
process.env.ESPACE_URL_SANS_PRIVE_E2E = `http://127.0.0.1:${portSansPrive}`;

// Base de l'espace privé propre à ce lancement : le serveur de test la crée et la migre au
// démarrage, les tests y insèrent leurs liens. Les processus de test héritent du chemin, et
// e2e/nettoyage.ts supprime le dossier temporaire en fin de campagne.
if (!process.env.ESPACE_BASE_E2E) {
  const dossier = mkdtempSync(join(tmpdir(), "nclsmgr-e2e-"));
  process.env.ESPACE_DOSSIER_E2E = dossier;
  process.env.ESPACE_BASE_E2E = join(dossier, "espace.db");
}
const baseEspace = process.env.ESPACE_BASE_E2E;

// Données privées fictives (e2e/prive-fictif.ts), écrites par e2e/preparation.ts dans un dossier
// temporaire supprimé lui aussi par e2e/nettoyage.ts.
if (!process.env.ESPACE_PRIVE_E2E) {
  const dossier = mkdtempSync(join(tmpdir(), "nclsmgr-e2e-prive-"));
  process.env.ESPACE_DOSSIER_PRIVE_E2E = dossier;
  process.env.ESPACE_PRIVE_E2E = dossier;
}
const dossierPrive = process.env.ESPACE_PRIVE_E2E;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/preparation.ts",
  globalTeardown: "./e2e/nettoyage.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node .next/standalone/server.js",
      url: `http://127.0.0.1:${port}/healthz`,
      env: {
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        ESPACE_BASE: baseEspace,
        ESPACE_PRIVE: dossierPrive,
      },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node .next/standalone/server.js",
      url: `http://127.0.0.1:${portSansPrive}/healthz`,
      env: {
        PORT: String(portSansPrive),
        HOSTNAME: "127.0.0.1",
        ESPACE_BASE: baseEspace,
        ESPACE_PRIVE: join(dossierPrive, "absent"),
      },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
