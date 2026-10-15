import { createHash, randomBytes, randomInt } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import Database from "better-sqlite3";

// Les liens sont insérés directement dans la base du serveur de test : src/lib/espace dépend
// de « server-only », qui lève hors de Next. Seule l'empreinte SHA-256 du jeton est stockée.
const JOUR = 86_400_000;
const ALPHABET_ID = "23456789abcdefghjkmnpqrstuvwxyz";

type Etat = "actif" | "expire" | "revoque";

function creerLien(etat: Etat = "actif", destinataire = "Claire Martin"): string {
  const chemin = process.env.ESPACE_BASE_E2E;
  if (!chemin) throw new Error("ESPACE_BASE_E2E manque : voir playwright.config.ts.");
  const jeton = randomBytes(32).toString("base64url");
  const maintenant = Date.now();
  let id = "l-";
  for (let i = 0; i < 6; i++) id += ALPHABET_ID[randomInt(ALPHABET_ID.length)];
  const db = new Database(chemin, { timeout: 5000 });
  try {
    db.prepare(
      `INSERT INTO liens (id, jeton_sha256, profil, langue, destinataire, documents, cree_le,
         expire_le, revoque_le)
       VALUES (?, ?, 'recruteur', 'fr', ?, '[]', ?, ?, ?)`,
    ).run(
      id,
      createHash("sha256").update(jeton).digest(),
      destinataire,
      etat === "expire" ? maintenant - 40 * JOUR : maintenant,
      etat === "expire" ? maintenant - 10 * JOUR : maintenant + 30 * JOUR,
      etat === "revoque" ? maintenant : null,
    );
  } finally {
    db.close();
  }
  return jeton;
}

// Révoque le lien après coup, sans supprimer ses sessions : la page doit revérifier l'état
// du lien à chaque requête, pas seulement l'existence de la session.
function revoquer(jeton: string) {
  const db = new Database(process.env.ESPACE_BASE_E2E ?? "", { timeout: 5000 });
  try {
    db.prepare("UPDATE liens SET revoque_le = ? WHERE jeton_sha256 = ?").run(
      Date.now(),
      createHash("sha256").update(jeton).digest(),
    );
  } finally {
    db.close();
  }
}

// Chaque test compte dans son propre compartiment de limitation de débit.
function ipUnique(): string {
  return `2001:db8:${randomBytes(2).toString("hex")}:${randomBytes(2).toString("hex")}::1`;
}

const MEME_ORIGINE = { "Sec-Fetch-Site": "same-origin" };

// Les en-têtes d'une réponse, sans ceux qui changent à chaque requête (date, nonce CSP).
function signature(reponse: APIResponse) {
  const enTetes = { ...reponse.headers() };
  delete enTetes.date;
  enTetes["content-security-policy"] = (enTetes["content-security-policy"] ?? "").replaceAll(
    /'nonce-[^']+'/g,
    "'nonce'",
  );
  return enTetes;
}

// Ouvre une session par la route d'accès et rend la valeur du cookie.
async function ouvrirSession(request: APIRequestContext, jeton: string): Promise<string> {
  const reponse = await request.post("/fr/p/acces", {
    headers: { ...MEME_ORIGINE, "X-Client-IP": ipUnique() },
    data: { jeton },
  });
  expect(reponse.status()).toBe(204);
  const valeur = /^__Host-espace=([^;]+);/.exec(reponse.headers()["set-cookie"])?.[1];
  if (!valeur) throw new Error("Cookie de session absent.");
  return valeur;
}

const COOKIE =
  /^__Host-espace=([A-Za-z0-9_-]{43}); Max-Age=(\d+); Path=\/; Secure; HttpOnly; SameSite=Lax$/;

test.describe("échange du jeton", () => {
  test("tous les cas d'échec reçoivent exactement la même réponse, sans cookie", async ({
    request,
  }) => {
    const ip = ipUnique();
    const valide = creerLien("actif");
    const json = { ...MEME_ORIGINE, "Content-Type": "application/json" };
    const cas: { nom: string; enTetes: Record<string, string>; corps: string | object }[] = [
      {
        nom: "inconnu",
        enTetes: MEME_ORIGINE,
        corps: { jeton: randomBytes(32).toString("base64url") },
      },
      { nom: "expiré", enTetes: MEME_ORIGINE, corps: { jeton: creerLien("expire") } },
      { nom: "révoqué", enTetes: MEME_ORIGINE, corps: { jeton: creerLien("revoque") } },
      { nom: "mal formé", enTetes: MEME_ORIGINE, corps: { jeton: "pas-un-jeton" } },
      { nom: "autre site", enTetes: { "Sec-Fetch-Site": "cross-site" }, corps: { jeton: valide } },
      { nom: "sans en-tête d'origine", enTetes: {}, corps: { jeton: valide } },
      { nom: "Origin: null", enTetes: { Origin: "null" }, corps: { jeton: valide } },
      {
        nom: "corps trop long",
        enTetes: json,
        corps: JSON.stringify({ jeton: valide, bourrage: "x".repeat(1024) }),
      },
      {
        nom: "mauvais Content-Type",
        enTetes: { ...MEME_ORIGINE, "Content-Type": "text/plain" },
        corps: JSON.stringify({ jeton: valide }),
      },
      { nom: "JSON invalide", enTetes: json, corps: `{"jeton":"${valide}"` },
    ];
    const reponses: { statut: number; corps: string; enTetes: Record<string, string> }[] = [];
    for (const { nom, enTetes, corps } of cas) {
      const debut = Date.now();
      const reponse = await request.post("/fr/p/acces", {
        headers: { ...enTetes, "X-Client-IP": ip },
        data: corps,
      });
      expect(Date.now() - debut, nom).toBeGreaterThanOrEqual(240);
      reponses.push({
        statut: reponse.status(),
        corps: await reponse.text(),
        enTetes: signature(reponse),
      });
    }
    expect(reponses[0].statut).toBe(403);
    expect(reponses[0].corps).toBe('{"ok":false}');
    expect(reponses[0].enTetes["set-cookie"]).toBeUndefined();
    expect(reponses[0].enTetes["cache-control"]).toBe("no-store");
    expect(reponses[0].enTetes["x-robots-tag"]).toBe("noindex");
    expect(reponses[0].enTetes["referrer-policy"]).toBeUndefined();
    reponses.forEach((reponse, i) => expect(reponse, cas[i].nom).toEqual(reponses[0]));
  });

  test("un jeton valide ouvre une session par un cookie __Host- et donne accès à l'espace", async ({
    request,
  }) => {
    const jeton = creerLien("actif");
    const debut = Date.now();
    const reponse = await request.post("/fr/p/acces", {
      headers: { ...MEME_ORIGINE, "X-Client-IP": ipUnique() },
      data: { jeton },
    });
    expect(Date.now() - debut).toBeGreaterThanOrEqual(240);
    expect(reponse.status()).toBe(204);
    expect(reponse.headers()["cache-control"]).toBe("no-store");
    expect(reponse.headers()["x-robots-tag"]).toBe("noindex");
    const cookie = reponse.headers()["set-cookie"];
    const [, valeur, maxAge] = COOKIE.exec(cookie) ?? [];
    expect(valeur).toBeDefined();
    expect(valeur).not.toBe(jeton);
    expect(Math.abs(Number(maxAge) - 30 * 86_400)).toBeLessThan(60);

    const espace = await request.get("/fr/espace", {
      headers: { Cookie: `__Host-espace=${valeur}` },
    });
    expect(espace.status()).toBe(200);
    expect(espace.headers()["cache-control"]).toContain("no-store");
    expect(espace.headers()["cache-control"]).toContain("private");
    expect(espace.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive, nosnippet");
    expect(espace.headers()["referrer-policy"]).toBe("same-origin");
    const html = await espace.text();
    expect(html).toContain("Bonjour Claire Martin,");
    expect(html).toMatch(/<meta name="robots" content="noindex, nofollow, noarchive, nosnippet"/);
  });

  test("à défaut de Sec-Fetch-Site, un Origin du même hôte est accepté", async ({
    request,
    baseURL,
  }) => {
    const reponse = await request.post("/fr/p/acces", {
      headers: { Origin: new URL(baseURL ?? "").origin, "X-Client-IP": ipUnique() },
      data: { jeton: creerLien("actif") },
    });
    expect(reponse.status()).toBe(204);
  });

  test("une requête d'un autre site est refusée, même avec un jeton valide", async ({
    request,
    baseURL,
  }) => {
    const ip = ipUnique();
    const jeton = creerLien("actif");
    const essais: Record<string, string>[] = [
      { "Sec-Fetch-Site": "cross-site", Origin: new URL(baseURL ?? "").origin },
      { "Sec-Fetch-Site": "same-site" },
      { Origin: "https://ailleurs.example" },
      {},
    ];
    for (const enTetes of essais) {
      const reponse = await request.post("/fr/p/acces", {
        headers: { ...enTetes, "X-Client-IP": ip },
        data: { jeton },
      });
      expect(reponse.status()).toBe(403);
      expect(await reponse.text()).toBe('{"ok":false}');
      expect(reponse.headers()["set-cookie"]).toBeUndefined();
    }
  });

  test("au-delà de 10 requêtes en 10 minutes, la réponse est 429 avec Retry-After", async ({
    request,
  }) => {
    // Toutes les adresses d'un même bloc /64 partagent le compteur.
    const bloc = `2001:db8:${randomBytes(2).toString("hex")}:${randomBytes(2).toString("hex")}`;
    for (let i = 1; i <= 10; i++) {
      const reponse = await request.post("/fr/p/acces", {
        headers: { ...MEME_ORIGINE, "X-Client-IP": `${bloc}::${i.toString(16)}` },
        data: { jeton: "x" },
      });
      expect(reponse.status()).toBe(403);
    }
    const debut = Date.now();
    const bloquee = await request.post("/fr/p/acces", {
      headers: { ...MEME_ORIGINE, "X-Client-IP": `${bloc}:aaaa:bbbb:cccc:dddd` },
      data: { jeton: creerLien("actif") },
    });
    expect(Date.now() - debut).toBeGreaterThanOrEqual(240);
    expect(bloquee.status()).toBe(429);
    expect(Number(bloquee.headers()["retry-after"])).toBeGreaterThan(500);
    expect(bloquee.headers()["cache-control"]).toBe("no-store");
    expect(bloquee.headers()["set-cookie"]).toBeUndefined();

    // Un autre bloc n'est pas concerné ; X-Forwarded-For n'est jamais lu.
    const autre = await request.post("/fr/p/acces", {
      headers: { ...MEME_ORIGINE, "X-Client-IP": ipUnique(), "X-Forwarded-For": `${bloc}::1` },
      data: { jeton: "x" },
    });
    expect(autre.status()).toBe(403);
  });

  test("la route d'accès n'accepte que POST", async ({ request }) => {
    const reponse = await request.get("/fr/p/acces");
    expect(reponse.status()).toBe(405);
    expect(reponse.headers()["cache-control"]).toBe("no-store");
    expect(reponse.headers()["x-robots-tag"]).toBe("noindex");
  });
});

test.describe("espace", () => {
  test("sans session valide, /fr/espace répond 404 sans cache ni indexation", async ({
    request,
  }) => {
    const essais: Record<string, string>[] = [
      {},
      { Cookie: `__Host-espace=${randomBytes(32).toString("base64url")}` },
      { Cookie: "__Host-espace=<script>" },
    ];
    for (const enTetes of essais) {
      const reponse = await request.get("/fr/espace", { headers: enTetes });
      expect(reponse.status()).toBe(404);
      expect(reponse.headers()["cache-control"]).toContain("no-store");
      expect(reponse.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive, nosnippet");
      expect(await reponse.text()).not.toContain("Bonjour");
    }
  });

  test("une session dont le lien est révoqué après l'ouverture ne montre plus rien", async ({
    request,
  }) => {
    const nom = `Revoque-${randomBytes(4).toString("hex")}`;
    const jeton = creerLien("actif", nom);
    const cookie = { Cookie: `__Host-espace=${await ouvrirSession(request, jeton)}` };
    const avant = await request.get("/fr/espace", { headers: cookie });
    expect(avant.status()).toBe(200);
    expect(await avant.text()).toContain(nom);
    revoquer(jeton);
    const apres = await request.get("/fr/espace", { headers: cookie });
    expect(apres.status()).toBe(404);
    expect(await apres.text()).not.toContain(nom);
  });

  test("aucune variante de requête sans session valide ne livre de donnée privée", async ({
    request,
  }) => {
    const nom = `Marqueur-${randomBytes(4).toString("hex")}`;
    const jeton = creerLien("actif", nom);
    const cookie = `__Host-espace=${await ouvrirSession(request, jeton)}`;
    revoquer(jeton);
    const sessions: Record<string, Record<string, string>> = {
      "sans session": {},
      "session révoquée": { Cookie: cookie },
    };
    const variantes: { nom: string; url: string; enTetes: Record<string, string> }[] = [
      { nom: "GET", url: "/fr/espace", enTetes: {} },
      { nom: "RSC: 1", url: "/fr/espace", enTetes: { RSC: "1" } },
      { nom: "?_rsc=x", url: "/fr/espace?_rsc=x", enTetes: {} },
      { nom: "?_rsc=x avec RSC: 1", url: "/fr/espace?_rsc=x", enTetes: { RSC: "1" } },
      {
        nom: "Next-Router-Prefetch: 1",
        url: "/fr/espace",
        enTetes: { RSC: "1", "Next-Router-Prefetch": "1" },
      },
    ];
    for (const [etat, enTetesSession] of Object.entries(sessions)) {
      const tete = await request.head("/fr/espace", { headers: enTetesSession });
      expect(tete.status(), `${etat}, HEAD`).toBe(404);
      for (const variante of variantes) {
        const reponse = await request.get(variante.url, {
          headers: { ...enTetesSession, ...variante.enTetes },
        });
        const corps = await reponse.text();
        expect(corps, `${etat}, ${variante.nom}`).not.toContain(nom);
        expect(reponse.headers()["cache-control"], `${etat}, ${variante.nom}`).toContain(
          "no-store",
        );
      }
    }
  });

  test("le nom du destinataire est affiché en texte brut", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "X-Client-IP": ipUnique() });
    const nom = `<img src=x onerror="document.body.dataset.pirate=1">Claire`;
    await page.goto(`/fr/p#${creerLien("actif", nom)}`);
    await page.getByRole("button", { name: "Accéder à mon espace" }).click();
    await expect(page.getByText(`Bonjour ${nom},`)).toBeVisible();
    await expect(page.locator("main img")).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveAttribute("data-pirate");
  });
});

test.describe("page /fr/p", () => {
  test("pas de cache, pas d'indexation, Referrer-Policy same-origin", async ({ request }) => {
    const reponse = await request.get("/fr/p");
    expect(reponse.status()).toBe(200);
    expect(reponse.headers()["cache-control"]).toContain("no-store");
    expect(reponse.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
    expect(reponse.headers()["referrer-policy"]).toBe("same-origin");
    expect(await reponse.text()).toMatch(
      /<meta name="robots" content="noindex, nofollow, noarchive"/,
    );
  });

  test("parcours complet : fragment effacé, entrée, puis sortie qui ferme la session", async ({
    page,
    context,
    request,
  }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });
    await page.setExtraHTTPHeaders({ "X-Client-IP": ipUnique() });
    const jeton = creerLien("actif");
    await page.goto(`/fr/p#${jeton}`);

    const bouton = page.getByRole("button", { name: "Accéder à mon espace" });
    await expect(bouton).toBeVisible();
    await expect(page.getByText(/sans adresse IP/)).toBeVisible();
    expect(page.url()).not.toContain("#");
    expect(page.url()).not.toContain(jeton);
    expect(await page.evaluate(() => window.location.hash)).toBe("");

    const axeAcces = await new AxeBuilder({ page }).analyze();
    expect(axeAcces.violations).toEqual([]);

    await bouton.click();
    await page.waitForURL("**/fr/espace");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Votre espace privé");
    await expect(page.getByText("Bonjour Claire Martin,")).toBeVisible();

    // Le cookie Secure est bien accepté par Chromium sur http://127.0.0.1.
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "__Host-espace");
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
    expect(session?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await page.evaluate(() => document.cookie)).not.toContain("__Host-espace");

    const axeEspace = await new AxeBuilder({ page }).analyze();
    expect(axeEspace.violations).toEqual([]);

    await page.getByRole("button", { name: "Quitter l'espace" }).click();
    await page.waitForURL(/\/fr$/);
    expect((await context.cookies()).find((c) => c.name === "__Host-espace")).toBeUndefined();

    // La session est fermée en base, pas seulement oubliée par le navigateur.
    const apres = await request.get("/fr/espace", {
      headers: { Cookie: `__Host-espace=${session?.value}` },
    });
    expect(apres.status()).toBe(404);
    expect(violations).toEqual([]);
  });

  test("le lien d'évitement ne remplace pas le jeton lu dans le fragment", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "X-Client-IP": ipUnique() });
    await page.goto(`/fr/p#${creerLien("actif")}`);
    const bouton = page.getByRole("button", { name: "Accéder à mon espace" });
    await expect(bouton).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Aller au contenu" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#contenu$/);
    await expect(bouton).toBeVisible();
    await expect(page.getByText("Ce lien n'est pas ou plus valide", { exact: false })).toHaveCount(
      0,
    );
    await bouton.click();
    await page.waitForURL("**/fr/espace");
    await expect(page.getByText("Bonjour Claire Martin,")).toBeVisible();
  });

  test("Retour après une navigation interne revérifie la session auprès du serveur", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "X-Client-IP": ipUnique() });
    const jeton = creerLien("actif");
    await page.goto(`/fr/p#${jeton}`);
    await page.getByRole("button", { name: "Accéder à mon espace" }).click();
    await page.waitForURL("**/fr/espace");
    await expect(page.getByText("Bonjour Claire Martin,")).toBeVisible();

    // Lien du logo : navigation côté client, la page reste dans le cache du routeur.
    await page.locator("a.site-brand").click();
    await page.waitForURL(/\/fr$/);
    revoquer(jeton);
    await page.goBack();
    await page.waitForURL("**/fr/espace");
    await expect(page.getByText("Bonjour")).toHaveCount(0);
  });

  test("une réponse qui ne vient pas de l'application affiche un message neutre", async ({
    page,
  }) => {
    const reponses = [
      { status: 403, contentType: "text/html", body: "<html>Accès bloqué</html>" },
      { status: 403, contentType: "application/json", body: '{"ok":false,"x":1}' },
      { status: 502, contentType: "text/html", body: "<html>Bad gateway</html>" },
    ];
    for (const reponse of reponses) {
      await page.route("**/fr/p/acces", (route) => route.fulfill(reponse));
      await page.goto("about:blank");
      await page.goto(`/fr/p#${randomBytes(32).toString("base64url")}`);
      await page.getByRole("button", { name: "Accéder à mon espace" }).click();
      await expect(page.getByRole("status")).toHaveText(
        "Une erreur est survenue. Réessayez dans quelques minutes.",
      );
      await expect(page.getByRole("button", { name: "Accéder à mon espace" })).toBeVisible();
      await page.unroute("**/fr/p/acces");
    }
  });

  test("les autres chemins sous /p ne sont ni mis en cache ni indexés", async ({ request }) => {
    const reponse = await request.get("/fr/p/inconnu");
    expect(reponse.status()).toBe(404);
    expect(reponse.headers()["cache-control"]).toContain("no-store");
    expect(reponse.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
    expect(reponse.headers()["referrer-policy"]).toBe("same-origin");
  });

  test("un lien refusé affiche un seul message avec le lien vers Contact", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "X-Client-IP": ipUnique() });
    await page.goto(`/fr/p#${creerLien("revoque")}`);
    await page.getByRole("button", { name: "Accéder à mon espace" }).click();
    const message = page.getByRole("status");
    await expect(message).toHaveText(
      "Ce lien n'est pas ou plus valide. Vous pouvez m'écrire depuis la page Contact.",
    );
    await expect(message.getByRole("link", { name: "page Contact" })).toHaveAttribute(
      "href",
      "/fr/contact",
    );
    await expect(page.getByRole("button", { name: "Accéder à mon espace" })).toHaveCount(0);
    expect(
      (await page.context().cookies()).find((c) => c.name === "__Host-espace"),
    ).toBeUndefined();
  });

  test("sans fragment, la page invite à rouvrir le lien et mène à l'espace", async ({ page }) => {
    await page.goto("/fr/p");
    await expect(page.getByText(/rouvrez le lien personnel/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Aller à mon espace" })).toHaveAttribute(
      "href",
      "/fr/espace",
    );
    await expect(page.getByRole("button", { name: "Accéder à mon espace" })).toHaveCount(0);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
  });

  test("en anglais, les textes suivent la langue", async ({ page }) => {
    await page.goto(`/en/p#${randomBytes(32).toString("base64url")}`);
    await expect(page.getByRole("button", { name: "Enter my space" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("sortie", () => {
  test("refuse un POST d'un autre site et n'accepte pas GET", async ({ request }) => {
    const refus = await request.post("/fr/espace/sortie", {
      headers: { "Sec-Fetch-Site": "cross-site" },
      maxRedirects: 0,
    });
    expect(refus.status()).toBe(403);
    expect(refus.headers()["set-cookie"]).toBeUndefined();
    expect((await request.get("/fr/espace/sortie")).status()).toBe(405);
  });

  test("efface le cookie, envoie Clear-Site-Data et redirige en 303", async ({ request }) => {
    const reponse = await request.post("/fr/espace/sortie", {
      headers: MEME_ORIGINE,
      maxRedirects: 0,
    });
    expect(reponse.status()).toBe(303);
    expect(reponse.headers()["location"]).toBe("/fr");
    expect(reponse.headers()["clear-site-data"]).toBe('"cookies"');
    expect(reponse.headers()["cache-control"]).toBe("no-store");
    expect(reponse.headers()["set-cookie"]).toBe(
      "__Host-espace=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax",
    );
  });
});
