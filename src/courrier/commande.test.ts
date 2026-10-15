import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ouvrirBase, type Base } from "@/lib/espace/base";
import type { MessageCourriel } from "@/lib/espace/courriels";
import { JOUR, verifierJeton } from "@/lib/espace/liens";
import { migrer } from "@/lib/espace/migrations";
import { lireSession, ouvrirSession } from "@/lib/espace/sessions";
import { ErreurCommande, executer, type Contexte } from "./commande";

const T0 = Date.UTC(2026, 9, 15, 12, 0);

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

  it("annule le lien si le courriel ne part pas", async () => {
    contexte.envoyer = vi.fn().mockRejectedValue(new Error("SMTP indisponible"));
    await expect(
      lancer({ action: "creer", profil: "recruteur", destinataire: "A" }),
    ).rejects.toThrow("Le courriel n'est pas parti : lien annulé, réessaie plus tard.");
    expect(db.prepare("SELECT count(*) AS n FROM liens").get()).toEqual({ n: 0 });
  });

  it("rend lisibles les erreurs de saisie et refuse les options inconnues", async () => {
    await expect(lancer({ action: "creer", profil: "recruteur" })).rejects.toThrow(
      "Le champ destinataire est obligatoire.",
    );
    await expect(
      lancer({ action: "creer", profil: "recruteur", destinataire: "A", jeton: "x" }),
    ).rejects.toThrow("Option inconnue : jeton.");
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
