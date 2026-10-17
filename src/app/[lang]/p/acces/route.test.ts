import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import Database from "better-sqlite3";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { base, type Base } from "@/lib/espace/base";
import { empreinte } from "@/lib/espace/jetons";
import { CompteurRefus, NOM_NON_AFFICHABLE } from "@/lib/espace/journal";
import { creerLien, JOUR, revoquerLien } from "@/lib/espace/liens";

// after() de Next n'existe que dans une requête servie par Next : les tâches sont gardées ici
// et lancées par le test, comme Next le ferait une fois la réponse envoyée.
const { taches } = vi.hoisted(() => {
  process.env.ESPACE_BASE = ":memory:";
  return { taches: [] as (() => unknown)[] };
});
vi.mock("next/server", () => ({ after: (tache: () => unknown) => void taches.push(tache) }));

const { POST } = await import("./route");

const NOM = "Camille Marqueur-Nom";
const ORGANISATION = "Organisation-Marqueur";
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0";

let db: Base;
let ip = 0;

function requete(jeton: unknown, enTetes: Record<string, string> = {}): Request {
  ip++;
  return new Request("http://127.0.0.1/fr/p/acces", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": FIREFOX,
      "CF-IPCountry": "FR",
      "X-Client-IP": `198.51.100.${ip}`,
      ...enTetes,
    },
    body: JSON.stringify({ jeton }),
  });
}

/** Lance les tâches confiées à after(), comme Next après l'envoi de la réponse. */
async function apresReponse() {
  for (const tache of taches.splice(0)) await tache();
}

function lien(etat: "actif" | "expire" | "revoque", destinataire = NOM) {
  const maintenant = Date.now();
  const cree = creerLien(
    db,
    {
      profil: "recruteur",
      langue: "fr",
      destinataire,
      organisation: ORGANISATION,
      dureeJours: etat === "expire" ? 1 : 30,
    },
    etat === "expire" ? maintenant - 2 * JOUR : maintenant,
  );
  if (etat === "revoque") revoquerLien(db, cree.lien.id, maintenant);
  return cree;
}

function compter(table: string, lienId?: string) {
  const sql = lienId
    ? `SELECT count(*) AS n FROM ${table} WHERE lien_id = ?`
    : `SELECT count(*) AS n FROM ${table}`;
  return (db.prepare(sql).get(...(lienId ? [lienId] : [])) as { n: number }).n;
}

beforeAll(() => {
  db = base();
});

afterEach(() => {
  vi.restoreAllMocks();
  taches.length = 0;
});

afterAll(() => db.close());

describe("POST /[lang]/p/acces", () => {
  it("écrit le journal et la notification après la réponse, pas avant", async () => {
    const { jeton, lien: cree } = lien("actif");
    const reponse = await POST(requete(jeton));
    expect(reponse.status).toBe(204);
    expect(compter("consultations", cree.id)).toBe(0);
    expect(compter("courriels")).toBe(0);
    expect(taches).toHaveLength(1);

    await apresReponse();
    expect(
      db.prepare("SELECT type, pays, navigateur FROM consultations WHERE lien_id = ?").all(cree.id),
    ).toEqual([{ type: "ouverture", pays: "FR", navigateur: "Firefox · Windows" }]);
    expect(
      (db.prepare("SELECT ouvert_le FROM liens WHERE id = ?").get(cree.id) as { ouvert_le: number })
        .ouvert_le,
    ).toBeGreaterThan(0);
    const [courriel] = db.prepare("SELECT modele, donnees FROM courriels").all() as {
      modele: string;
      donnees: string;
    }[];
    expect(courriel.modele).toBe("ouverture");
    expect(JSON.parse(courriel.donnees)).toMatchObject({ lienId: cree.id, destinataire: NOM });
  });

  it("un essai sur un lien révoqué est noté et rattaché au lien ; un jeton inconnu, nulle part", async () => {
    const { jeton, lien: cree } = lien("revoque");
    const avant = compter("consultations");
    const reponses = [
      await POST(requete(jeton)),
      await POST(requete(randomBytes(32).toString("base64url"))),
    ];
    expect(reponses.map((r) => r.status)).toEqual([403, 403]);
    await apresReponse();
    expect(compter("consultations")).toBe(avant + 1);
    expect(db.prepare("SELECT type FROM consultations WHERE lien_id = ?").all(cree.id)).toEqual([
      { type: "essai_refuse" },
    ]);
  });

  it("seuls les échanges de jeton refusés comptent pour l'alerte, pas les refus d'origine ni les 429", async () => {
    const ajouter = vi.spyOn(CompteurRefus.prototype, "ajouter");
    const expire = lien("expire");
    const revoque = lien("revoque");
    const corps = (r: Response) => r.text();
    const enTetes = (r: Response) => [...r.headers.entries()].sort();

    // Écartés avant l'échange : page tierce (qui ne lit pas la réponse) et débit dépassé.
    const ecartees = [
      await POST(requete(expire.jeton, { "Sec-Fetch-Site": "cross-site" })),
      await POST(requete(expire.jeton, { "Sec-Fetch-Site": "same-site" })),
    ];
    const memeIp = { "X-Client-IP": "203.0.113.200" };
    const rafale: Response[] = [];
    for (let i = 0; i < 11; i++) rafale.push(await POST(requete("pas-un-jeton", memeIp)));
    expect(rafale.map((r) => r.status)).toEqual([...Array(10).fill(403), 429]);
    await apresReponse();
    // Les 10 essais passés par le limiteur comptent ; ni le 429 ni les refus d'origine.
    expect(ajouter).toHaveBeenCalledTimes(10);

    // Échanges refusés : corps invalide, jeton mal formé, inconnu, expiré, révoqué.
    const nonJson = new Request("http://127.0.0.1/fr/p/acces", {
      method: "POST",
      headers: { "Content-Type": "text/plain", "Sec-Fetch-Site": "same-origin" },
      body: "{",
    });
    const refusees = [
      await POST(nonJson),
      await POST(requete({ jeton: 1 })),
      await POST(requete("pas-un-jeton")),
      await POST(requete(randomBytes(32).toString("base64url"))),
      await POST(requete(expire.jeton)),
      await POST(requete(revoque.jeton)),
    ];
    await apresReponse();
    expect(ajouter).toHaveBeenCalledTimes(16);
    expect(compter("consultations", expire.lien.id)).toBe(1);
    expect(compter("consultations", revoque.lien.id)).toBe(1);

    // La réponse reste la même, comptée ou non : statut, corps et en-têtes.
    const reference = enTetes(refusees[0]);
    for (const reponse of [...ecartees, ...rafale.slice(0, 10), ...refusees]) {
      expect(reponse.status).toBe(403);
      expect(await corps(reponse)).toBe('{"ok":false}');
      expect(enTetes(reponse)).toEqual(reference);
    }
  });

  it("aucun journal applicatif ne contient de jeton, d'empreinte, de nom ni d'organisation", async () => {
    const methodes = ["log", "info", "warn", "error", "debug", "trace"] as const;
    const espions: MockInstance[] = methodes.map((methode) =>
      vi.spyOn(console, methode).mockImplementation(() => {}),
    );
    const secrets: string[] = [NOM, ORGANISATION];
    const retenir = (jeton: string) => {
      const condense = empreinte(jeton);
      secrets.push(jeton, condense.toString("hex"), condense.toString("base64"));
      return jeton;
    };

    const actif = lien("actif");
    const expire = lien("expire");
    const revoque = lien("revoque");
    // Nom qui s'allonge à la normalisation : la notification est refusée par son valideur.
    const allonge = lien("actif", `${"a".repeat(119)}\u{FB00}`);
    const enPanne = lien("actif");
    const panneJournal = lien("revoque");
    const verrou = lien("revoque");
    for (const cree of [actif, expire, revoque, allonge, enPanne, panneJournal, verrou])
      retenir(cree.jeton);
    const inconnu = retenir(randomBytes(32).toString("base64url"));

    // Parcours ordinaires.
    for (const jeton of [actif.jeton, actif.jeton, expire.jeton, revoque.jeton, inconnu]) {
      await POST(requete(jeton));
    }
    await POST(requete("pas-un-jeton"));
    await POST(requete(actif.jeton, { "Sec-Fetch-Site": "cross-site" }));
    await POST(requete(allonge.jeton));
    await apresReponse();

    // Panne pendant l'échange : l'erreur porte le jeton et le nom, le journal ne doit rien en
    // reprendre.
    const fuite = (jeton: string) => () => {
      throw new Error(`échec ${jeton} ${empreinte(jeton).toString("hex")} ${NOM} ${ORGANISATION}`);
    };
    const prepare = vi.spyOn(db, "prepare").mockImplementationOnce(fuite(enPanne.jeton));
    expect((await POST(requete(enPanne.jeton))).status).toBe(403);
    prepare.mockRestore();
    await apresReponse();

    // Panne pendant l'écriture du journal, après la réponse.
    expect((await POST(requete(panneJournal.jeton))).status).toBe(403);
    vi.spyOn(db, "prepare").mockImplementation(fuite(panneJournal.jeton));
    await apresReponse();
    vi.mocked(db.prepare).mockRestore();

    // Base verrouillée : le journal ne porte que le code SQLite, pas le message.
    expect((await POST(requete(verrou.jeton))).status).toBe(403);
    vi.spyOn(db, "prepare").mockImplementation(() => {
      throw new Database.SqliteError(`verrou ${verrou.jeton} ${NOM}`, "SQLITE_BUSY");
    });
    await apresReponse();
    vi.mocked(db.prepare).mockRestore();

    // Le nom refusé par le valideur des courriels n'a pas fait perdre la notification.
    expect(
      (
        db
          .prepare("SELECT donnees FROM courriels WHERE json_extract(donnees, '$.lienId') = ?")
          .all(allonge.lien.id) as { donnees: string }[]
      ).map((c) => JSON.parse(c.donnees)),
    ).toEqual([expect.objectContaining({ destinataire: NOM_NON_AFFICHABLE, organisation: null })]);

    const ecrit = espions.flatMap((espion) =>
      espion.mock.calls.map((appel) => appel.map((argument) => inspect(argument)).join(" ")),
    );
    // Les pannes et le nom refusé ont bien laissé des messages, tous génériques.
    expect(ecrit).toEqual(
      expect.arrayContaining([
        expect.stringContaining("échange de jeton impossible"),
        expect.stringContaining(
          "écriture du journal des consultations impossible (erreur non SQLite)",
        ),
        expect.stringContaining("écriture du journal des consultations impossible (SQLITE_BUSY)"),
        expect.stringContaining("nom du lien refusé par le valideur des courriels"),
      ]),
    );
    for (const ligne of ecrit) {
      for (const secret of secrets) expect(ligne).not.toContain(secret);
      expect(ligne).not.toContain("aaaaaaaa");
      expect(ligne).not.toMatch(/[A-Za-z0-9_-]{43}/);
    }
  }, 30_000);
});
