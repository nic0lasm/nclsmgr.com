import "server-only";
import type { Base } from "./base";
import { estIdLien } from "./jetons";

// Les courriels partent tous vers Nico, en texte brut, avec un sujet fixe par modèle.
// La file ne contient que le nom du modèle et ses données : aucun texte libre n'y est rédigé.
export const modeles = ["ouverture", "essai_refuse", "alerte", "contact"] as const;
export type Modele = (typeof modeles)[number];

export type DonneesCourriel = {
  ouverture: {
    lienId: string;
    destinataire: string;
    organisation: string | null;
    le: number;
    pays: string | null;
    navigateur: string | null;
  };
  essai_refuse: {
    lienId: string;
    destinataire: string;
    organisation: string | null;
    motif: "expire" | "revoque";
    finLe: number;
    le: number;
  };
  alerte: { refus: number; depuis: number; jusqua: number };
  contact: { nom: string; courriel: string; message: string; le: number };
};

export type MessageCourriel = { sujet: string; texte: string; repondreA?: string };

export const MAX_PAR_HEURE = 30;
export const MAX_ESSAIS = 12;
const HEURE = 60 * 60 * 1000;
const DELAI_MAX = 6 * HEURE;

const dateParis = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu;
const FORMAT_COURRIEL = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export class CourrielInvalide extends Error {}

function objet(valeur: unknown): Record<string, unknown> {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
    throw new CourrielInvalide("Données de courriel invalides.");
  }
  return valeur as Record<string, unknown>;
}

function date(valeur: unknown): string {
  if (typeof valeur !== "number" || !Number.isFinite(valeur)) {
    throw new CourrielInvalide("Date invalide.");
  }
  return dateParis.format(valeur);
}

function entier(valeur: unknown): number {
  if (!Number.isSafeInteger(valeur) || (valeur as number) < 0) {
    throw new CourrielInvalide("Nombre invalide.");
  }
  return valeur as number;
}

/** Texte nettoyé de tout caractère invisible ; le message garde ses retours à la ligne. */
function texte(valeur: unknown, max: number, lignes = false): string {
  if (typeof valeur !== "string") throw new CourrielInvalide("Texte attendu.");
  const normalise = valeur.replace(/\r\n?/g, "\n");
  const propre = lignes
    ? normalise
        .split("\n")
        .map((ligne) => ligne.replace(INVISIBLE, ""))
        .join("\n")
    : normalise.replace(INVISIBLE, " ");
  const resultat = propre.trim();
  if (!resultat || resultat.length > max) throw new CourrielInvalide("Texte vide ou trop long.");
  return resultat;
}

function facultatif(valeur: unknown, max: number): string | null {
  return valeur === null || valeur === undefined ? null : texte(valeur, max);
}

function lien(donnees: Record<string, unknown>): string {
  if (!estIdLien(donnees.lienId)) throw new CourrielInvalide("Identifiant de lien invalide.");
  const destinataire = texte(donnees.destinataire, 120);
  const organisation = facultatif(donnees.organisation, 120);
  return `${donnees.lienId} (${organisation ? `${destinataire}, ${organisation}` : destinataire})`;
}

/** Rédige le courriel d'un modèle à partir de ses données, revérifiées à chaque fois. */
export function rediger(modele: Modele, donneesBrutes: unknown): MessageCourriel {
  const donnees = objet(donneesBrutes);
  switch (modele) {
    case "ouverture":
      return {
        sujet: "Espace privé : lien ouvert",
        texte: [
          `Le lien ${lien(donnees)} vient d'être ouvert pour la première fois.`,
          "",
          `Date : ${date(donnees.le)}`,
          `Pays : ${facultatif(donnees.pays, 2) ?? "inconnu"}`,
          `Navigateur : ${facultatif(donnees.navigateur, 40) ?? "inconnu"}`,
        ].join("\n"),
      };
    case "essai_refuse": {
      const fin = donnees.motif === "revoque" ? "révoqué" : "expiré";
      if (donnees.motif !== "revoque" && donnees.motif !== "expire") {
        throw new CourrielInvalide("Motif invalide.");
      }
      return {
        sujet: "Espace privé : essai sur un lien inactif",
        texte: [
          `Le lien ${lien(donnees)}, ${fin} le ${date(donnees.finLe)}, a été essayé le ${date(donnees.le)}.`,
          "",
          "Tu peux le prolonger avec la commande liens si l'accès doit reprendre.",
        ].join("\n"),
      };
    }
    case "alerte":
      return {
        sujet: "Espace privé : essais refusés en nombre",
        texte: [
          `${entier(donnees.refus)} essais d'accès refusés entre le ${date(donnees.depuis)} et le ${date(donnees.jusqua)}.`,
          "",
          "La limitation de débit reste active. Cette alerte part au plus une fois par heure.",
        ].join("\n"),
      };
    case "contact": {
      const courriel = texte(donnees.courriel, 254);
      if (!FORMAT_COURRIEL.test(courriel)) throw new CourrielInvalide("Adresse invalide.");
      return {
        sujet: "Message depuis nclsmgr.com",
        repondreA: courriel,
        texte: [
          `De : ${texte(donnees.nom, 120)} <${courriel}>`,
          `Date : ${date(donnees.le)}`,
          "",
          texte(donnees.message, 5000, true),
        ].join("\n"),
      };
    }
    default:
      throw new CourrielInvalide("Modèle inconnu.");
  }
}

/** Met un courriel en file ; ses données sont vérifiées tout de suite plutôt qu'à l'envoi. */
export function mettreEnFile<M extends Modele>(
  db: Base,
  modele: M,
  donnees: DonneesCourriel[M],
  maintenant: number,
): number {
  rediger(modele, donnees);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO courriels (modele, donnees, cree_le) VALUES (?, ?, ?)")
    .run(modele, JSON.stringify(donnees), maintenant);
  return Number(lastInsertRowid);
}

export type CourrielEnAttente = { id: number; modele: Modele; donnees: string; essais: number };

/** Courriels prêts à partir, dans la limite de MAX_PAR_HEURE envois sur une heure glissante. */
export function courrielsAEnvoyer(db: Base, maintenant: number): CourrielEnAttente[] {
  const { n } = db
    .prepare<[number], { n: number }>("SELECT count(*) AS n FROM courriels WHERE envoye_le > ?")
    .get(maintenant - HEURE) as { n: number };
  const place = MAX_PAR_HEURE - n;
  if (place <= 0) return [];
  return db
    .prepare<[number, number, number], CourrielEnAttente>(
      `SELECT id, modele, donnees, essais FROM courriels
       WHERE envoye_le IS NULL AND essais < ? AND (prochain_le IS NULL OR prochain_le <= ?)
       ORDER BY cree_le, id LIMIT ?`,
    )
    .all(MAX_ESSAIS, maintenant, place);
}

export function marquerEnvoye(db: Base, id: number, maintenant: number): void {
  db.prepare("UPDATE courriels SET envoye_le = ?, prochain_le = NULL WHERE id = ?").run(
    maintenant,
    id,
  );
}

/** Après un échec, le prochain essai attend 2, 4, 8... minutes, jusqu'à 6 heures. */
export function marquerEchec(db: Base, id: number, maintenant: number, definitif = false): void {
  const { essais } = db
    .prepare<[number], { essais: number }>("SELECT essais FROM courriels WHERE id = ?")
    .get(id) ?? { essais: 0 };
  const suivant = definitif ? MAX_ESSAIS : essais + 1;
  const delai = Math.min(60_000 * 2 ** suivant, DELAI_MAX);
  db.prepare("UPDATE courriels SET essais = ?, prochain_le = ? WHERE id = ?").run(
    suivant,
    maintenant + delai,
    id,
  );
}
