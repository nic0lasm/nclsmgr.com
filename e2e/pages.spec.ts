import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "",
  "/cv",
  "/portfolio",
  "/articles",
  "/contact",
  "/mentions-legales",
  "/confidentialite",
];

test("redirige vers la langue du visiteur", async ({ request }) => {
  const res = await request.get("/", {
    headers: { "Accept-Language": "en-US,en;q=0.9" },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toBe("/en");
});

for (const lang of ["fr", "en"]) {
  for (const route of routes) {
    const url = `/${lang}${route}`;

    test(`${url} : CSP stricte respectée et page accessible`, async ({ page }) => {
      const violations: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) {
          violations.push(msg.text());
        }
      });

      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
      const csp = res?.headers()["content-security-policy"] ?? "";
      expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      expect(csp).not.toContain("unsafe-inline");
      expect(res?.headers()["x-powered-by"]).toBeUndefined();

      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(
        page.locator(`link[rel="alternate"][hreflang="${lang === "fr" ? "en" : "fr"}"]`),
      ).toHaveCount(1);
      await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
      expect(violations).toEqual([]);

      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations).toEqual([]);
    });
  }
}

test("les liens internes des pages de texte gardent la langue", async ({ page }) => {
  await page.goto("/en/mentions-legales");
  await page
    .getByRole("main")
    .getByRole("link", { name: /privacy/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/en\/confidentialite$/);
});

test("sur mobile, le tableau de la confidentialité reste accessible au clavier", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/fr/confidentialite");
  const region = page.getByRole("region", { name: "Ce qui est traité" });
  await expect(region).toHaveAttribute("tabindex", "0");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test("un article s'affiche avec un seul titre, sans violation axe", async ({ page }) => {
  const res = await page.goto("/fr/articles/securite-des-la-conception");
  expect(res?.status()).toBe(200);
  expect(res?.headers()["content-security-policy"]).toMatch(/'nonce-[^']+'/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  // L'article n'existe qu'en français : aucune version anglaise annoncée.
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test("un slug inconnu répond 404", async ({ page }) => {
  const res = await page.goto("/fr/articles/inconnu");
  expect(res?.status()).toBe(404);
});

test("un article absent dans une langue renvoie à la liste des articles", async ({ page }) => {
  await page.goto("/en/articles/securite-des-la-conception");
  await expect(page).toHaveURL(/\/en\/articles$/);
  await page.getByRole("main").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/fr\/articles\/securite-des-la-conception$/);
});
