import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = 3100;

// Base de l'espace privé propre à ce lancement : le serveur de test la crée et la migre au
// démarrage, les tests y insèrent leurs liens. Les processus de test héritent du chemin.
const baseEspace = (process.env.ESPACE_BASE_E2E ??= join(
  mkdtempSync(join(tmpdir(), "nclsmgr-e2e-")),
  "espace.db",
));

export default defineConfig({
  testDir: "e2e",
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
