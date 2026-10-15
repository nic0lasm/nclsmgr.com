import { createHash, randomBytes, randomInt } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";
import Database from "better-sqlite3";
import portfolioFr from "../src/content/fr/portfolio.json";
import parcoursFr from "../src/content/fr/parcours.json";
import projetsFr from "../src/content/projets/fr.json";
import { pdfFictif } from "./documents-fictifs";
import { PRIVE_FICTIF } from "./prive-fictif";

// Les liens sont insérés directement dans la base du serveur de test : src/lib/espace dépend
// de « server-only », qui lève hors de Next. Seule l'empreinte SHA-256 du jeton est stockée.
const JOUR = 86_400_000;
const ALPHABET_ID = "23456789abcdefghjkmnpqrstuvwxyz";

type Etat = "actif" | "expire" | "revoque";
type Profil = "recruteur" | "developpeur" | "client" | "partenaire";
type OptionsLien = {
  profil?: Profil;
  langue?: "fr" | "en";
  organisation?: string;
  message?: string;
  documents?: string[];
};

function creerLien(
  etat: Etat = "actif",
  destinataire = "Claire Martin",
  options: OptionsLien = {},
): string {
  const chemin = process.env.ESPACE_BASE_E2E;
  if (!chemin) throw new Error("ESPACE_BASE_E2E manque : voir playwright.config.ts.");
  const jeton = randomBytes(32).toString("base64url");
  const maintenant = Date.now();
  let id = "l-";
  for (let i = 0; i < 6; i++) id += ALPHABET_ID[randomInt(ALPHABET_ID.length)];
  const db = new Database(chemin, { timeout: 5000 });
  try {
    db.prepare(
      `INSERT INTO liens (id, jeton_sha256, profil, langue, destinataire, organisation, message,
         documents, cree_le, expire_le, revoque_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      createHash("sha256").update(jeton).digest(),
      options.profil ?? "recruteur",
      options.langue ?? "fr",
      destinataire,
      options.organisation ?? null,
      options.message ?? null,
      JSON.stringify(options.documents ?? []),
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

// Fait expirer le lien après l'ouverture de la session.
function expirer(jeton: string) {
  const db = new Database(process.env.ESPACE_BASE_E2E ?? "", { timeout: 5000 });
  try {
    db.prepare("UPDATE liens SET expire_le = ? WHERE jeton_sha256 = ?").run(
      Date.now() - 1,
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

// Lecture de la base du serveur de test : journal et file des courriels d'un lien.
function lireTraces(jeton: string) {
  const db = new Database(process.env.ESPACE_BASE_E2E ?? "", { timeout: 5000, readonly: true });
  try {
    const { id, ouvert_le } = db
      .prepare("SELECT id, ouvert_le FROM liens WHERE jeton_sha256 = ?")
      .get(createHash("sha256").update(jeton).digest()) as { id: string; ouvert_le: number | null };
    return {
      ouvertLe: ouvert_le,
      consultations: db
        .prepare("SELECT type, pays, navigateur FROM consultations WHERE lien_id = ? ORDER BY id")
        .all(id),
      courriels: (
        db
          .prepare(
            `SELECT modele, donnees FROM courriels
             WHERE json_extract(donnees, '$.lienId') = ? ORDER BY id`,
          )
          .all(id) as { modele: string; donnees: string }[]
      ).map(({ modele, donnees }) => ({ modele, ...JSON.parse(donnees) })),
    };
  } finally {
    db.close();
  }
}

test.describe("journal des consultations", () => {
  const FIREFOX =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0";

  test("une ouverture écrit une ligne de journal et une notification, à la première seulement", async ({
    request,
  }) => {
    const nom = `Journal-${randomBytes(4).toString("hex")}`;
    const jeton = creerLien("actif", nom);
    const enTetes = { ...MEME_ORIGINE, "User-Agent": FIREFOX, "CF-IPCountry": "BE" };
    for (let i = 0; i < 2; i++) {
      const reponse = await request.post("/fr/p/acces", {
        headers: { ...enTetes, "X-Client-IP": ipUnique() },
        data: { jeton },
      });
      expect(reponse.status()).toBe(204);
      // Les écritures partent après la réponse : on attend qu'elles soient faites.
      await expect.poll(() => lireTraces(jeton).consultations.length).toBe(i + 1);
    }
    const traces = lireTraces(jeton);
    expect(traces.ouvertLe).toEqual(expect.any(Number));
    expect(traces.consultations).toEqual([
      { type: "ouverture", pays: "BE", navigateur: "Firefox · Windows" },
      { type: "ouverture", pays: "BE", navigateur: "Firefox · Windows" },
    ]);
    expect(traces.courriels).toEqual([
      expect.objectContaining({
        modele: "ouverture",
        destinataire: nom,
        pays: "BE",
        navigateur: "Firefox · Windows",
      }),
    ]);
  });

  test("un essai sur un lien expiré est noté avec une notification, sans changer la réponse", async ({
    request,
  }) => {
    const jeton = creerLien("expire");
    const reponses: string[] = [];
    for (let i = 0; i < 2; i++) {
      const reponse = await request.post("/fr/p/acces", {
        headers: { ...MEME_ORIGINE, "X-Client-IP": ipUnique(), "CF-IPCountry": "T1" },
        data: { jeton },
      });
      expect(reponse.status()).toBe(403);
      reponses.push((await reponse.body()).toString("hex"));
      await expect.poll(() => lireTraces(jeton).consultations.length).toBe(i + 1);
    }
    expect(reponses[0]).toBe(Buffer.from('{"ok":false}').toString("hex"));
    expect(reponses[1]).toBe(reponses[0]);
    const traces = lireTraces(jeton);
    expect(traces.ouvertLe).toBeNull();
    expect(traces.consultations).toEqual([
      expect.objectContaining({ type: "essai_refuse", pays: null }),
      expect.objectContaining({ type: "essai_refuse", pays: null }),
    ]);
    expect(traces.courriels).toEqual([
      expect.objectContaining({ modele: "essai_refuse", motif: "expire" }),
    ]);
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

test.describe("contenu par profil", () => {
  // Second serveur de playwright.config.ts, lancé sans prive.json.
  const SANS_PRIVE = process.env.ESPACE_URL_SANS_PRIVE_E2E ?? "";
  const { coordonnees, references } = PRIVE_FICTIF.fr;

  async function entrer(page: Page, jeton: string, langue: "fr" | "en" = "fr", origine = "") {
    await page.setExtraHTTPHeaders({ "X-Client-IP": ipUnique() });
    await page.goto(`${origine}/${langue}/p#${jeton}`);
    const bouton = langue === "fr" ? "Accéder à mon espace" : "Enter my space";
    await page.getByRole("button", { name: bouton }).click();
    await page.waitForURL(`**/${langue}/espace`);
  }

  async function sansViolation(page: Page) {
    // Après une navigation côté client, le titre peut arriver un peu après le contenu.
    await expect(page).toHaveTitle(/\S/);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
  }

  // Les intitulés de section disent à eux seuls quels blocs sont présents, et dans quel ordre.
  const sections = (page: Page) => page.locator("main h2").allTextContents();

  // Ce que doit montrer l'onglet contributions, d'après les fiches projets publiques.
  const fiches = projetsFr.projets.filter((f) => f.afficher);
  const ouverts = fiches.filter((f) => f.contribuer);
  const avecDocument = (nom: RegExp) => fiches.some((f) => f.liens.some((l) => nom.test(l.url)));
  const sectionsDeveloppeur = [
    ouverts.length > 0 ? "Projets ouverts aux contributions" : "Projets publics",
    ...(avecDocument(/\/ROADMAP\.md$/i) ? ["Feuilles de route"] : []),
    ...(avecDocument(/\/CONTRIBUTING\.md$/i) ? ["Guides de contribution"] : []),
  ];

  test("recruteur : parcours, références et coordonnées", async ({ page }) => {
    await entrer(page, creerLien("actif", "Claire Martin", { profil: "recruteur" }));
    await expect(page.getByText("Bonjour Claire Martin,")).toBeVisible();
    expect(await sections(page)).toEqual(["Parcours", "Références", "Coordonnées"]);

    for (const experience of parcoursFr.experiences) {
      await expect(
        page.getByRole("heading", { level: 3, name: experience.poste, exact: true }),
      ).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Voir le CV" })).toHaveAttribute("href", "/fr/cv");

    const reference = page.getByRole("article", { name: references[0].nom });
    await expect(reference.getByText("Directrice de programme · Société Exemple")).toBeVisible();
    await expect(reference.locator("p")).toHaveText([
      "Directrice de programme · Société Exemple",
      "Référence fictive, première ligne.",
      "Deuxième ligne.",
      "Contact : camille@example.com",
    ]);
    await expect(reference.getByRole("link", { name: "camille@example.com" })).toHaveAttribute(
      "href",
      "mailto:camille@example.com",
    );

    await expect(page.getByRole("link", { name: coordonnees.telephone })).toHaveAttribute(
      "href",
      "tel:+33639980000",
    );
    await expect(page.getByRole("link", { name: coordonnees.email })).toHaveAttribute(
      "href",
      `mailto:${coordonnees.email}`,
    );
    await expect(page.getByText(coordonnees.ville)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "linkedin.com/in/exemple-fictif" }),
    ).toHaveAttribute("href", coordonnees.linkedin);

    // Rien des autres profils.
    const html = await page.content();
    expect(html).not.toContain("Comment contribuer");
    expect(html).not.toContain(portfolioFr.etudes[0].contexte);
    await sansViolation(page);
  });

  test("développeur : projets ouverts, sans aucune donnée privée", async ({ page }) => {
    await entrer(page, creerLien("actif", "Claire Martin", { profil: "developpeur" }));
    await expect(page.getByText("Bonjour Claire Martin,")).toBeVisible();
    expect(await sections(page)).toEqual(sectionsDeveloppeur);

    for (const fiche of ouverts.length > 0 ? ouverts : fiches) {
      const article = page.getByRole("article", { name: fiche.titre });
      await expect(article).toBeVisible();
      if (fiche.contribuer) await expect(article.getByText(fiche.contribuer)).toBeVisible();
      for (const lien of fiche.liens) {
        await expect(article.getByRole("link", { name: lien.libelle })).toHaveAttribute(
          "href",
          lien.url,
        );
      }
    }
    await expect(
      page.getByRole("link", { name: "Tous mes projets dans l'onglet Dev" }),
    ).toHaveAttribute("href", "/fr/dev");

    const html = await page.content();
    for (const prive of [
      coordonnees.telephone,
      coordonnees.email,
      coordonnees.ville,
      references[0].nom,
    ]) {
      expect(html).not.toContain(prive);
    }
    expect(html).not.toContain(parcoursFr.experiences[0].contexte);
    expect(html).not.toContain(portfolioFr.etudes[0].contexte);
    await sansViolation(page);
  });

  for (const profil of ["client", "partenaire"] as const) {
    test(`${profil} : études de cas et coordonnées`, async ({ page }) => {
      await entrer(page, creerLien("actif", "Claire Martin", { profil }));
      await expect(page.getByText("Bonjour Claire Martin,")).toBeVisible();
      expect(await sections(page)).toEqual(["Études de cas", "Coordonnées"]);
      for (const etude of portfolioFr.etudes) {
        await expect(
          page.getByRole("heading", { level: 3, name: etude.titre, exact: true }),
        ).toBeVisible();
      }
      await expect(page.getByRole("link", { name: "Voir le portfolio" })).toHaveAttribute(
        "href",
        "/fr/portfolio",
      );
      await expect(page.getByRole("link", { name: coordonnees.email })).toBeVisible();

      const html = await page.content();
      expect(html).not.toContain(references[0].nom);
      expect(html).not.toContain("Comment contribuer");
      expect(html).not.toContain(parcoursFr.experiences[0].contexte);
      await sansViolation(page);
    });
  }

  test("le message est affiché en texte brut, un paragraphe par ligne", async ({ page }) => {
    const message = "Merci pour notre échange.\n\n<b>x</b><script>";
    const jeton = creerLien("actif", "Claire Martin", {
      profil: "client",
      organisation: "Société Test",
      message,
    });
    await entrer(page, jeton);
    await expect(page.getByText("<b>x</b><script>", { exact: true })).toBeVisible();
    await expect(page.locator(".private-slip__body p")).toHaveText([
      "Bonjour Claire Martin,",
      "Merci pour notre échange.",
      "<b>x</b><script>",
    ]);
    await expect(page.locator(".private-slip__header")).toContainText("Société Test");
    await expect(page.locator("main b")).toHaveCount(0);
    await expect(page.locator("main script")).toHaveCount(0);
  });

  test("en anglais, les blocs suivent la langue de la page et le message garde la sienne", async ({
    page,
  }) => {
    const jeton = creerLien("actif", "Claire Martin", {
      profil: "recruteur",
      langue: "fr",
      message: "Ravi de vous revoir.",
    });
    await entrer(page, jeton, "en");
    await expect(page.getByText("Hello Claire Martin,")).toBeVisible();
    expect(await sections(page)).toEqual(["Background", "References", "Contact details"]);
    await expect(page.locator('.private-slip__body p[lang="fr"]')).toHaveText(
      "Ravi de vous revoir.",
    );
    await expect(page.getByRole("link", { name: PRIVE_FICTIF.en.coordonnees.email })).toBeVisible();
    expect(await page.content()).not.toContain(coordonnees.ville);
    await sansViolation(page);
  });

  test("bloc Documents : documents du lien présents au catalogue, dans la langue de la page", async ({
    page,
  }) => {
    await entrer(
      page,
      creerLien("actif", "Claire Martin", { documents: ["inconnu", "cv", "annexe"] }),
    );
    expect(await sections(page)).toEqual(["Documents", "Parcours", "Références", "Coordonnées"]);
    const liens = page.getByRole("region", { name: "Documents" }).getByRole("link");
    await expect(liens).toHaveText(["CV complet (PDF)", "Annexe fictive (PDF)"]);
    await expect(liens.nth(0)).toHaveAttribute("href", "/fr/espace/documents/cv");
    await expect(liens.nth(1)).toHaveAttribute("href", "/fr/espace/documents/annexe");
    await sansViolation(page);

    // Le lien mène bien au PDF avec la session du navigateur.
    const pdf = await page.request.get("/fr/espace/documents/cv");
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");

    // En anglais : titre anglais du CV, titre français de l'annexe, marqué comme tel.
    await page.goto("/en/espace");
    await expect(liens).toHaveText(["Full résumé (PDF)", "Annexe fictive (PDF)"]);
    await expect(liens.nth(0)).toHaveAttribute("href", "/en/espace/documents/cv");
    await expect(liens.nth(1).locator('span[lang="fr"]')).toHaveText("Annexe fictive");
    await sansViolation(page);
  });

  test("bloc Documents masqué sans document du lien au catalogue", async ({ page }) => {
    const cas: { documents: string[]; origine: string }[] = [
      { documents: [], origine: "" },
      { documents: ["inconnu"], origine: "" },
      // Second serveur : pas de catalogue du tout.
      { documents: ["cv"], origine: SANS_PRIVE },
    ];
    for (const { documents, origine } of cas) {
      await page.context().clearCookies();
      await entrer(page, creerLien("actif", "Claire Martin", { documents }), "fr", origine);
      await expect(page.getByText("Bonjour Claire Martin,")).toBeVisible();
      expect(await sections(page), documents.join(",")).not.toContain("Documents");
      expect(await page.content()).not.toContain("/espace/documents/");
    }
  });

  test("sans prive.json, les blocs privés sont masqués et le reste s'affiche", async ({ page }) => {
    const attendu: Record<Profil, string[]> = {
      recruteur: ["Parcours"],
      developpeur: sectionsDeveloppeur,
      client: ["Études de cas"],
      partenaire: ["Études de cas"],
    };
    for (const [profil, titres] of Object.entries(attendu) as [Profil, string[]][]) {
      await page.context().clearCookies();
      await entrer(page, creerLien("actif", "Claire Martin", { profil }), "fr", SANS_PRIVE);
      await expect(page.getByText("Bonjour Claire Martin,")).toBeVisible();
      expect(await sections(page), profil).toEqual(titres);
      expect(await page.content()).not.toContain(coordonnees.email);
    }
  });
});

test.describe("documents réservés", () => {
  const CSP =
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-downloads";

  async function session(request: APIRequestContext, documents: string[]) {
    const jeton = creerLien("actif", "Claire Martin", { documents });
    return { jeton, enTetes: { Cookie: `__Host-espace=${await ouvrirSession(request, jeton)}` } };
  }

  test("un lien recruteur reçoit le PDF de la langue demandée, avec ses en-têtes", async ({
    request,
  }) => {
    const { enTetes } = await session(request, ["cv"]);
    for (const [langue, texte, nom] of [
      ["fr", "CV-fictif-FR", "Exemple-CV.pdf"],
      ["en", "CV-fictif-EN", "Example-Resume.pdf"],
    ]) {
      const attendu = pdfFictif(texte);
      const reponse = await request.get(`/${langue}/espace/documents/cv`, { headers: enTetes });
      expect(reponse.status()).toBe(200);
      expect((await reponse.body()).equals(attendu)).toBe(true);
      const h = reponse.headers();
      expect(h).toMatchObject({
        "content-type": "application/pdf",
        "content-length": String(attendu.length),
        "content-disposition": `inline; filename="${nom}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
        "referrer-policy": "same-origin",
        "accept-ranges": "none",
        "content-security-policy": CSP,
      });
      expect(h["set-cookie"]).toBeUndefined();
      expect(h["etag"]).toBeUndefined();
      expect(h["last-modified"]).toBeUndefined();
    }

    // Les requêtes partielles sont ignorées : le fichier part en entier.
    const partielle = await request.get("/fr/espace/documents/cv", {
      headers: { ...enTetes, Range: "bytes=0-3" },
    });
    expect(partielle.status()).toBe(200);
    expect((await partielle.body()).equals(pdfFictif("CV-fictif-FR"))).toBe(true);
  });

  test("tous les refus reçoivent exactement la même réponse 404", async ({ request }) => {
    const autres = await session(request, [
      "manquant",
      "symbolique",
      "dossier",
      "trop-grand",
      "pas-pdf",
      "inconnu",
    ]);
    const revoque = await session(request, ["cv"]);
    revoquer(revoque.jeton);
    const expire = await session(request, ["cv"]);
    expirer(expire.jeton);
    const cas: { nom: string; id: string; enTetes: Record<string, string> }[] = [
      { nom: "sans session", id: "cv", enTetes: {} },
      {
        nom: "cookie inconnu",
        id: "cv",
        enTetes: { Cookie: `__Host-espace=${randomBytes(32).toString("base64url")}` },
      },
      { nom: "lien révoqué", id: "cv", enTetes: revoque.enTetes },
      { nom: "lien expiré", id: "cv", enTetes: expire.enTetes },
      { nom: "document hors du lien", id: "cv", enTetes: autres.enTetes },
      { nom: "absent du catalogue", id: "inconnu", enTetes: autres.enTetes },
      { nom: "fichier manquant", id: "manquant", enTetes: autres.enTetes },
      { nom: "lien symbolique", id: "symbolique", enTetes: autres.enTetes },
      { nom: "dossier", id: "dossier", enTetes: autres.enTetes },
      { nom: "fichier trop grand", id: "trop-grand", enTetes: autres.enTetes },
      { nom: "pas un PDF", id: "pas-pdf", enTetes: autres.enTetes },
      { nom: "identifiant avec extension", id: "cv.pdf", enTetes: revoque.enTetes },
    ];
    const reponses: { statut: number; corps: string; enTetes: Record<string, string> }[] = [];
    for (const { id, enTetes } of cas) {
      const reponse = await request.get(`/fr/espace/documents/${id}`, { headers: enTetes });
      reponses.push({
        statut: reponse.status(),
        corps: await reponse.text(),
        enTetes: signature(reponse),
      });
    }
    expect(reponses[0].statut).toBe(404);
    expect(reponses[0].corps).toBe("");
    expect(reponses[0].enTetes).toMatchObject({
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": CSP,
    });
    expect(reponses[0].enTetes["content-type"]).toBeUndefined();
    reponses.forEach((reponse, i) => expect(reponse, cas[i].nom).toEqual(reponses[0]));

    const tete = await request.head("/fr/espace/documents/cv");
    expect(tete.status()).toBe(404);
  });
});
