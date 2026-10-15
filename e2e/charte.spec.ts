import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const backgrounds = { light: "rgb(245, 246, 244)", dark: "rgb(15, 20, 26)" } as const;

function bodyBackground(page: import("@playwright/test").Page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

for (const lang of ["fr", "en"]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`page ${lang} en thème ${scheme} : couleurs de la charte et accessibilité`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/${lang}`);
      expect(await bodyBackground(page)).toBe(backgrounds[scheme]);

      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations).toEqual([]);
    });
  }
}

test("le choix de thème est appliqué et survit au rechargement", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) {
      violations.push(msg.text());
    }
  });

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/fr");
  const toggle = page.getByRole("button", { name: "Passer en thème sombre" });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bodyBackground(page)).toBe(backgrounds.dark);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Passer en thème clair" })).toBeVisible();
  expect(violations).toEqual([]);
});

test("le lien d'évitement est le premier élément atteint au clavier", async ({ page }) => {
  await page.goto("/fr");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Aller au contenu" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page).toHaveURL(/#contenu$/);
});

test("le lien de langue mène à la même page dans l'autre langue", async ({ page }) => {
  await page.goto("/fr");
  await page.getByRole("link", { name: "English (EN)" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("les polices sont servies par le site", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (req) => {
    if (req.resourceType() === "font" && !req.url().startsWith("http://127.0.0.1")) {
      external.push(req.url());
    }
  });
  await page.goto("/fr");
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((font) => font.status === "loaded").length;
  });
  expect(loaded).toBeGreaterThanOrEqual(3);
  expect(external).toEqual([]);
});
