import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("redirige vers la langue du visiteur", async ({ request }) => {
  const res = await request.get("/", {
    headers: { "Accept-Language": "en-US,en;q=0.9" },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toBe("/en");
});

for (const lang of ["fr", "en"]) {
  test(`page ${lang} : CSP stricte respectée et page accessible`, async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) {
        violations.push(msg.text());
      }
    });

    const res = await page.goto(`/${lang}`);
    expect(res?.status()).toBe(200);
    const csp = res?.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).not.toContain("unsafe-inline");
    expect(res?.headers()["x-powered-by"]).toBeUndefined();

    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(violations).toEqual([]);

    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
  });
}
