import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { base, type Base } from "@/lib/espace/base";
import { creerLien } from "@/lib/espace/liens";
import { ouvrirSession } from "@/lib/espace/sessions";

// after() de Next n'existe que dans une requête servie par Next : les tâches sont gardées ici
// et lancées par le test, comme Next le ferait une fois la réponse envoyée. Le cookie de
// session est fourni par une fausse fonction cookies().
const etat = vi.hoisted(() => {
  process.env.ESPACE_BASE = ":memory:";
  return { taches: [] as (() => unknown)[], cookie: undefined as string | undefined };
});
vi.mock("next/server", () => ({ after: (tache: () => unknown) => void etat.taches.push(tache) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nom: string) =>
      nom === "__Host-espace" && etat.cookie ? { value: etat.cookie } : undefined,
  }),
}));

const { GET } = await import("./route");

const PDF = Buffer.from("%PDF-1.4\n% document fictif\n%%EOF\n", "latin1");
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0";

let db: Base;
let racine: string;

function lire(id: string, methode: "GET" | "HEAD" = "GET") {
  return GET(
    new Request(`http://127.0.0.1/fr/espace/documents/${id}`, {
      method: methode,
      headers: { "User-Agent": FIREFOX, "CF-IPCountry": "FR" },
    }),
    { params: Promise.resolve({ lang: "fr", id }) },
  );
}

async function apresReponse() {
  for (const tache of etat.taches.splice(0)) await tache();
}

/** Ouvre une session pour un nouveau lien et la rend courante ; rend l'identifiant du lien. */
function entrer(documents: string[]): string {
  const maintenant = Date.now();
  const { lien } = creerLien(
    db,
    { profil: "recruteur", langue: "fr", destinataire: "Camille", documents },
    maintenant,
  );
  etat.cookie = ouvrirSession(db, lien, maintenant).valeur;
  return lien.id;
}

const lignes = (lienId: string) =>
  db
    .prepare("SELECT type, document, pays, navigateur FROM consultations WHERE lien_id = ?")
    .all(lienId);

beforeAll(() => {
  racine = mkdtempSync(join(tmpdir(), "espace-route-documents-"));
  const dossier = join(racine, "documents");
  mkdirSync(dossier, { mode: 0o700 });
  writeFileSync(
    join(dossier, "catalogue.json"),
    JSON.stringify({
      cv: { titre: { fr: "CV" }, fichiers: { fr: "cv.pdf" } },
      manquant: { titre: { fr: "Manquant" }, fichiers: { fr: "manquant.pdf" } },
    }),
    { mode: 0o600 },
  );
  writeFileSync(join(dossier, "cv.pdf"), PDF, { mode: 0o600 });
  vi.stubEnv("ESPACE_PRIVE", racine);
  db = base();
});

afterEach(() => {
  vi.restoreAllMocks();
  etat.taches.length = 0;
  etat.cookie = undefined;
});

afterAll(() => {
  vi.unstubAllEnvs();
  db.close();
  rmSync(racine, { recursive: true, force: true });
});

describe("GET /[lang]/espace/documents/[id]", () => {
  it("note une lecture au journal après la réponse, pas avant", async () => {
    const lienId = entrer(["cv"]);
    const reponse = await lire("cv");
    expect(reponse.status).toBe(200);
    expect(lignes(lienId)).toEqual([]);
    await apresReponse();
    expect(lignes(lienId)).toEqual([
      { type: "document", document: "cv", pays: "FR", navigateur: "Firefox · Windows" },
    ]);
  });

  it("deux lectures rapprochées ne laissent qu'une ligne", async () => {
    const lienId = entrer(["cv"]);
    for (let i = 0; i < 2; i++) {
      expect((await lire("cv")).status).toBe(200);
      await apresReponse();
    }
    expect(lignes(lienId)).toHaveLength(1);
  });

  it("HEAD, un document refusé ou une requête sans session ne notent rien", async () => {
    const lienId = entrer(["cv", "manquant"]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await lire("cv", "HEAD")).status).toBe(200);
    for (const id of ["manquant", "inconnu", "cv.pdf"]) expect((await lire(id)).status).toBe(404);
    etat.cookie = undefined;
    expect((await lire("cv")).status).toBe(404);
    expect(etat.taches).toHaveLength(0);
    await apresReponse();
    expect(lignes(lienId)).toEqual([]);
  });

  it("une erreur d'écriture du journal n'écrit qu'un message fixe", async () => {
    const lienId = entrer(["cv"]);
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});
    db.exec("DROP TRIGGER IF EXISTS test_bloque");
    db.exec(
      `CREATE TRIGGER test_bloque BEFORE INSERT ON consultations
       BEGIN SELECT RAISE(ABORT, 'contenu-a-ne-pas-citer'); END`,
    );
    try {
      expect((await lire("cv")).status).toBe(200);
      await apresReponse();
    } finally {
      db.exec("DROP TRIGGER test_bloque");
    }
    expect(lignes(lienId)).toEqual([]);
    expect(erreurs.mock.calls).toEqual([
      [
        "Espace privé : écriture du journal des consultations impossible (SQLITE_CONSTRAINT_TRIGGER).",
      ],
    ]);
  });
});
