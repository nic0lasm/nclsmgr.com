import { defineConfig, devices } from "@playwright/test";
import { BASE_E2E } from "./e2e/base";

const port = 3100;

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
    env: { PORT: String(port), HOSTNAME: "127.0.0.1", ESPACE_BASE: BASE_E2E },
    reuseExistingServer: !process.env.CI,
  },
});
