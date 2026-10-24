import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const lang of ["fr", "en"]) {
  test(`onglet Dev ${lang} : fiches, liste, CSP et accessibilité`, async ({ page, baseURL }) => {
    const origine = new URL(baseURL ?? "http://127.0.0.1").origin;
    const requetesTierces: string[] = [];
    const violations: string[] = [];
    page.on("request", (req) => {
      if (new URL(req.url()).origin !== origine) requetesTierces.push(req.url());
    });
    page.on("console", (msg) => {
      if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) {
        violations.push(msg.text());
      }
    });

    const res = await page.goto(`/${lang}/dev`);
    expect(res?.status()).toBe(200);
    expect(res?.headers()["content-security-policy"]).toMatch(/connect-src 'self'/);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const fiches = page.locator("article.project");
    await expect(fiches.first()).toContainText("Frontfall");
    await expect(fiches.nth(1)).toContainText("Zeus + Poseidon");
    await expect(page.getByRole("img").first()).toBeVisible();
    await expect(fiches).toHaveCount(4);

    await page.waitForLoadState("networkidle");
    expect(requetesTierces).toEqual([]);
    expect(violations).toEqual([]);

    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
  });
}
