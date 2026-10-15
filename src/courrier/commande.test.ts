import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ouvrirBase, type Base } from "@/lib/espace/base";
import type { MessageCourriel } from "@/lib/espace/courriels";
import { JOUR, verifierJeton } from "@/lib/espace/liens";
import { migrer } from "@/lib/espace/migrations";
import { lireSession, ouvrirSession } from "@/lib/espace/sessions";
import { ErreurCommande, executer, MAX_CREATIONS_PAR_HEURE, type Contexte } from "./commande";

const T0 = Date.UTC(2026, 9, 15, 12, 0);
const HEURE = 3_600_000;

let db: Base;
let envoyes: MessageCourriel[];
let contexte: Contexte;

function lancer(entree: unknown, maintenant = T0) {
  return executer(db, entree, { ...contexte, maintenant: () => maintenant });
}

async function creer(options: Record<string, unknown> = {}) {
  const sortie = await lancer({
    action: "creer",
    profil: "recruteur",
    destinataire: "Camille",
    organisation: "Acme",
    ...options,
  });
  const id = /l-[a-z0-9]{6}/.exec(sortie)![0];
  const jeton = /#([A-Za-z0-9_-]{43})/.exec(envoyes.at(-1)!.texte)![1];
  return { sortie, id, jeton };
}

beforeEach(() => {
  db = ouvrirBase(":memory:");
  migrer(db);
  envoyes = [];
  contexte = {
    envoyer: async (message) => void envoyes.push(message),
    maintenant: () => T0,
    site: "https://nclsmgr.com",
  };
});

afterEach(() => db.close());

describe("liens creer", () => {
  it("envoie le lien par courriel et ne l'affiche jamais", async () => {
    const { sortie, id, jeton } = await creer({ langue: "en", dureeJours: 10 });
    expect(sortie).toBe(
      `Lien ${id} créé pour Camille (Acme), valable jusqu'au 25/10/2026. Il t'a été envoyé par courriel.`,
    );
    expect(sortie).not.toContain(jeton);
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0].sujet).toBe("Espace privé : nouveau lien");
    expect(envoyes[0].texte).toContain(`https://nclsmgr.com/en/p#${jeton}`);
    expect(verifierJeton(db, jeton, T0).valide).toBe(true);
  });

  const nombreDeLiens = () => db.prepare("SELECT count(*) AS n FROM liens").get();

  it("n'enregistre aucun lien si le courriel ne part pas", async () => {
    contexte.envoyer = vi.fn().mockRejectedValue(new Error("SMTP indisponible"));
    await expect(
      lancer({ action: "creer", profil: "recruteur", destinataire: "A" }),
    ).rejects.toThrow("Le courriel n'est pas parti : aucun lien créé, réessaie plus tard.");
    expect(nombreDeLiens()).toEqual({ n: 0 });
  });

  it("n'écrit rien en base tant que l'envoi n'est pas revenu", async () => {
    // Un envoi qui ne revient jamais équivaut à un processus tué pendant l'envoi.
    let envoiCommence = false;
    contexte.envoyer = () => {
      envoiCommence = true;
      return new Promise<void>(() => {});
    };
    void lancer({ action: "creer", profil: "recruteur", destinataire: "A" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(envoiCommence).toBe(true);
    expect(nombreDeLiens()).toEqual({ n: 0 });
  });

  it("prévient que le lien reçu est inactif si l'enregistrement échoue après l'envoi", async () => {
    contexte.envoyer = async (message) => {
      envoyes.push(message);
      db.pragma("query_only = ON");
    };
    const echec = lancer({ action: "creer", profil: "recruteur", destinataire: "A" });
    await expect(echec).rejects.toThrow(ErreurCommande);
    await expect(echec).rejects.toThrow(
      /^Le courriel est parti mais le lien l-[a-z0-9]{6} n'a pas pu être enregistré : le lien reçu ne fonctionnera pas, crées-en un autre\.$/,
    );
    db.pragma("query_only = OFF");
    expect(envoyes).toHaveLength(1);
    expect(nombreDeLiens()).toEqual({ n: 0 });
  });

  it(`refuse plus de ${MAX_CREATIONS_PAR_HEURE} créations par heure`, async () => {
    for (let i = 0; i < MAX_CREATIONS_PAR_HEURE; i++) await creer();
    await expect(
      lancer({ action: "creer", profil: "recruteur", destinataire: "A" }, T0 + HEURE - 1),
    ).rejects.toThrow(
      `Déjà ${MAX_CREATIONS_PAR_HEURE} liens créés dans l'heure : réessaie plus tard.`,
    );
    expect(envoyes).toHaveLength(MAX_CREATIONS_PAR_HEURE);
    await expect(
      lancer({ action: "creer", profil: "recruteur", destinataire: "A" }, T0 + HEURE),
    ).resolves.toMatch(/^Lien l-/);
  });

  it("rend lisibles les erreurs de saisie et refuse les options inconnues", async () => {
    await expect(lancer({ action: "creer", profil: "recruteur" })).rejects.toThrow(
      "Le champ destinataire est obligatoire.",
    );
    await expect(
      lancer({ action: "creer", profil: "recruteur", destinataire: "A", jeton: "x" }),
    ).rejects.toThrow("Option inconnue : jeton.");
    // Ce que le script du Mac envoie pour « --documents '*' ».
    await expect(
      lancer({ action: "creer", profil: "recruteur", destinataire: "A", documents: ["*"] }),
    ).rejects.toThrow("Liste de documents invalide.");
    expect(envoyes).toEqual([]);
  });
});

describe("autres actions", () => {
  it("liste les liens actifs, ou tous", async () => {
    expect(await lancer({ action: "lister" })).toBe("Aucun lien actif.");
    const { id } = await creer();
    const court = await creer({ destinataire: "Sam", organisation: undefined, dureeJours: 1 });
    const actifs = await lancer({ action: "lister" }, T0 + 2 * JOUR);
    expect(actifs).toContain(id);
    expect(actifs).not.toContain(court.id);
    const tous = await lancer({ action: "lister", tous: true }, T0 + 2 * JOUR);
    expect(tous.split("\n")).toHaveLength(2);
    expect(tous).toMatch(new RegExp(`${court.id}  expiré +recruteur`));
    expect(tous).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });

  it("montre le journal d'un lien", async () => {
    const { id } = await creer();
    expect(await lancer({ action: "journal", id })).toBe(
      `${id}  actif  Camille (Acme)\nAucune consultation.`,
    );
    db.prepare(
      "INSERT INTO consultations (lien_id, type, document, le, pays, navigateur) VALUES (?, 'document', 'cv', ?, 'FR', 'Firefox')",
    ).run(id, T0);
    expect(await lancer({ action: "journal", id })).toContain(
      "15/10/2026 14:00  document cv  FR  Firefox",
    );
  });

  it("retire du journal les caractères invisibles ou de contrôle venus des visiteurs", async () => {
    const { id } = await creer();
    db.prepare(
      "INSERT INTO consultations (lien_id, type, document, le, pays, navigateur) VALUES (?, 'document', ?, ?, ?, ?)",
    ).run(id, "cv\u{7}\u{2028}", T0, "F\u{200b}R", "Fire\u{1b}[2J\u{9b}fox\u{202e}\u{2029}");
    const sortie = await lancer({ action: "journal", id });
    expect(sortie.split("\n").at(-1)).toBe("15/10/2026 14:00  document cv  FR  Fire[2Jfox");
  });

  it("prolonge un lien et ses sessions, sans dépasser 180 jours", async () => {
    const { id, jeton } = await creer({ dureeJours: 10 });
    const lien = verifierJeton(db, jeton, T0).lien!;
    const session = ouvrirSession(db, lien, T0);
    expect(await lancer({ action: "prolonger", id, jours: 20 })).toBe(
      `Lien ${id} valable jusqu'au 14/11/2026.`,
    );
    expect(lireSession(db, session.valeur, T0 + 12 * JOUR)?.id).toBe(id);
    expect(await lancer({ action: "prolonger", id, jours: 180 })).toBe(
      `Lien ${id} valable jusqu'au 13/04/2027.`,
    );
    await expect(lancer({ action: "prolonger", id, jours: 0 })).rejects.toThrow(ErreurCommande);
  });

  it("prolonge un lien expiré sans ressusciter ses sessions expirées", async () => {
    const { id, jeton } = await creer({ dureeJours: 1 });
    const session = ouvrirSession(db, verifierJeton(db, jeton, T0).lien!, T0);
    expect(await lancer({ action: "prolonger", id, jours: 10 }, T0 + 2 * JOUR)).toBe(
      `Lien ${id} valable jusqu'au 27/10/2026.`,
    );
    expect(verifierJeton(db, jeton, T0 + 3 * JOUR).valide).toBe(true);
    expect(lireSession(db, session.valeur, T0 + 3 * JOUR)).toBeNull();
  });

  it("révoque, puis refuse de prolonger, et supprime", async () => {
    const { id, jeton } = await creer();
    expect(await lancer({ action: "revoquer", id })).toBe(
      `Lien ${id} révoqué : ses sessions sont fermées.`,
    );
    expect(await lancer({ action: "revoquer", id })).toBe(`Lien ${id} déjà révoqué.`);
    expect(verifierJeton(db, jeton, T0).valide).toBe(false);
    await expect(lancer({ action: "prolonger", id, jours: 5 })).rejects.toThrow(
      "Un lien révoqué ne se prolonge pas.",
    );
    expect(await lancer({ action: "supprimer", id })).toBe(
      `Lien ${id} supprimé, avec ses sessions et son journal.`,
    );
    await expect(lancer({ action: "journal", id })).rejects.toThrow(`Lien inconnu : ${id}.`);
  });

  it("purge selon les durées de conservation", async () => {
    await creer({ dureeJours: 1 });
    expect(await lancer({ action: "purger" }, T0 + 100 * JOUR)).toBe(
      "Purge : 1 lien(s), 0 session(s), 0 consultation(s), 0 courriel(s) supprimés.",
    );
  });

  it.each([
    [null, "Entrée attendue : un objet JSON."],
    [[], "Entrée attendue : un objet JSON."],
    [{}, "Action inconnue."],
    [{ action: "constructor" }, "Action inconnue."],
    [{ action: "journal", id: "../../etc" }, "Identifiant de lien invalide"],
    [{ action: "purger", force: true }, "Option inconnue : force."],
  ])("refuse l'entrée %j", async (entree, message) => {
    await expect(lancer(entree)).rejects.toThrow(message);
  });
});
