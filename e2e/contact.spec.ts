import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import { BASE_E2E } from "./base";

// Sans Caddy devant le serveur de test, chaque test se présente avec sa propre adresse pour ne
// pas partager la limite d'envois.
test.use({ extraHTTPHeaders: { "X-Client-IP": `192.0.2.${Math.floor(Math.random() * 250) + 1}` } });

function messagesEnFile(repere: string): string[] {
  const db = new Database(BASE_E2E, { readonly: true, fileMustExist: true });
  try {
    const lignes = db.prepare("SELECT donnees FROM courriels WHERE modele = 'contact'").all() as {
      donnees: string;
    }[];
    return lignes
      .map((ligne) => (JSON.parse(ligne.donnees) as { message: string }).message)
      .filter((message) => message.includes(repere));
  } finally {
    db.close();
  }
}

async function remplir(page: Page, repere: string) {
  await page.getByLabel("Nom").fill("Alex Martin");
  await page.getByLabel("E-mail").fill("alex@example.com");
  await page.getByLabel("Objet").selectOption("Projet");
  await page.getByLabel("Message").fill(`Bonjour, ${repere}`);
}

test("le message part et rejoint la file d'envoi", async ({ page }) => {
  const repere = `essai-js-${Date.now()}`;
  await page.goto("/fr/contact");
  await remplir(page, repere);
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByRole("status")).toHaveText(/Message bien reçu/);
  expect(messagesEnFile(repere)).toEqual([
    `Objet : Projet\nLangue de la page : FR\n\nBonjour, ${repere}`,
  ]);
});

test("les erreurs de champ restent accessibles", async ({ page }) => {
  await page.goto("/fr/contact");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByLabel("Message")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Message")).toHaveAccessibleDescription("Ce champ est nécessaire.");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test.describe("sans JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("les erreurs s'affichent puis le message part", async ({ page }) => {
    const repere = `essai-sans-js-${Date.now()}`;
    await page.goto("/fr/contact");
    await page.getByLabel("E-mail").fill("alex");
    await page.getByRole("button", { name: "Envoyer" }).click();

    await expect(page.getByLabel("Nom")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("E-mail")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("E-mail")).toHaveValue("alex");
    await expect(page.getByText("Cette adresse e-mail ne semble pas valide.")).toBeVisible();

    await remplir(page, repere);
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByRole("status")).toHaveText(/Message bien reçu/);
    expect(messagesEnFile(repere)).toHaveLength(1);
  });

  test("un robot qui remplit le champ piège n'envoie rien", async ({ page }) => {
    const repere = `essai-piege-${Date.now()}`;
    await page.goto("/fr/contact");
    await remplir(page, repere);
    await page.locator("#verification").fill("https://spam.example");
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByRole("status")).toHaveText(/Message bien reçu/);
    expect(messagesEnFile(repere)).toEqual([]);
  });
});

test("le formulaire anglais est traduit", async ({ page }) => {
  await page.goto("/en/contact");
  await expect(page.getByLabel("Email")).toHaveAttribute("type", "email");
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});
