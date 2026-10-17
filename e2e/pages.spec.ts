import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["", "/cv", "/portfolio", "/contact", "/mentions-legales", "/confidentialite"];

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

for (const [lang, titre] of [
  ["fr", "Page introuvable"],
  ["en", "Page not found"],
] as const) {
  test(`/${lang} : une adresse inconnue répond 404 avec la page introuvable de sa langue`, async ({
    page,
  }) => {
    const res = await page.goto(`/${lang}/adresse/inconnue`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(titre);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page).toHaveTitle(`${titre} · Nicolas M`);
    await expect(
      page.getByRole("link", {
        name: lang === "fr" ? "Retour à l'accueil" : "Back to the home page",
      }),
    ).toHaveAttribute("href", `/${lang}`);

    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
  });
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

test("robots.txt, sitemap.xml et icônes sont servis", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const texteRobots = await robots.text();
  expect(texteRobots).toContain("Disallow: /fr/espace");
  expect(texteRobots).toContain("Disallow: /fr/p$");
  expect(texteRobots).not.toMatch(/^Disallow: \/fr\/p$/m);
  expect(texteRobots).toContain("Sitemap: https://nclsmgr.com/sitemap.xml");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  for (const chemin of ["/fr", "/en/cv", "/fr/dev", "/en/confidentialite"]) {
    expect(xml).toContain(`<loc>https://nclsmgr.com${chemin}</loc>`);
  }
  expect(xml).not.toContain("/espace");

  for (const icone of ["/favicon.ico", "/apple-icon.png"]) {
    expect((await request.get(icone)).status()).toBe(200);
  }
});
