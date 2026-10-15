import "server-only";
import type { Base } from "./base";
import { estIdLien } from "./jetons";

// Les courriels partent tous vers Nico, en texte brut, avec un sujet fixe par modèle.
// La file ne contient que le nom du modèle et ses données vérifiées et nettoyées : aucun texte
// libre n'y est rédigé.
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
/** Au-delà, un nouveau message de contact est refusé tant que la file ne s'est pas vidée. */
export const MAX_CONTACTS_EN_ATTENTE = 50;
const HEURE = 60 * 60 * 1000;
const DELAI_MAX = 6 * HEURE;
/** Un courriel pris pour envoi n'est repris par personne d'autre pendant ce délai. */
const RESERVATION = 10 * 60 * 1000;
/** Plus grande date que Date sait représenter, en millisecondes. */
const DATE_MAX = 8.64e15;
const EN_ATTENTE = "envoye_le IS NULL AND abandonne_le IS NULL";

const dateParis = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

// Retirés de tout texte : contrôles, formats, caractères privés ou non attribués, séparateurs
// de ligne, sélecteurs de variante, et caractères de remplissage qui s'affichent comme du vide.
const INVISIBLE =
  /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}\u{115F}\u{1160}\u{2800}\u{3164}\u{FFA0}]/gu;
const ESPACES = /\p{Zs}/gu;
// Adresse en ASCII seulement : pas de caractère qui ressemble à @ ou à un point.
const FORMAT_COURRIEL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export class CourrielInvalide extends Error {}
export class FileSaturee extends Error {}

function objet(valeur: unknown): Record<string, unknown> {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
    throw new CourrielInvalide("Données de courriel invalides.");
  }
  return valeur as Record<string, unknown>;
}

function date(valeur: unknown): number {
  if (typeof valeur !== "number" || !Number.isFinite(valeur) || Math.abs(valeur) > DATE_MAX) {
    throw new CourrielInvalide("Date invalide.");
  }
  return valeur;
}

function entier(valeur: unknown): number {
  if (!Number.isSafeInteger(valeur) || (valeur as number) < 0) {
    throw new CourrielInvalide("Nombre invalide.");
  }
  return valeur as number;
}

/**
 * Texte nettoyé de tout caractère invisible ; seul le message garde ses retours à la ligne.
 * La longueur est bornée avant et après nettoyage.
 */
function texte(valeur: unknown, max: number, lignes = false): string {
  if (typeof valeur !== "string" || valeur.length > max) {
    throw new CourrielInvalide("Texte attendu, de longueur limitée.");
  }
  const nettoyer = (ligne: string) => ligne.replace(INVISIBLE, "");
  const normalise = valeur.normalize("NFKC").replace(/\r\n?/g, "\n").replace(ESPACES, " ");
  const propre = lignes
    ? normalise.split("\n").map(nettoyer).join("\n")
    : nettoyer(normalise.replace(/[\n\t]/g, " "));
  const resultat = propre.trim();
  if (!resultat || resultat.length > max) throw new CourrielInvalide("Texte vide ou trop long.");
  return resultat;
}

function facultatif(valeur: unknown, max: number): string | null {
  return valeur === null || valeur === undefined ? null : texte(valeur, max);
}

function personne(donnees: Record<string, unknown>) {
  if (!estIdLien(donnees.lienId)) throw new CourrielInvalide("Identifiant de lien invalide.");
  return {
    lienId: donnees.lienId,
    destinataire: texte(donnees.destinataire, 120),
    organisation: facultatif(donnees.organisation, 120),
  };
}

function motif(valeur: unknown): "expire" | "revoque" {
  if (valeur !== "expire" && valeur !== "revoque") throw new CourrielInvalide("Motif invalide.");
  return valeur;
}

function nom(valeur: unknown): string {
  // Sans chevrons ni guillemets, un nom ne peut pas imiter une adresse dans le courriel.
  const propre = texte(valeur, 120).replace(/[<>"]/g, "").trim();
  if (!propre) throw new CourrielInvalide("Nom invalide.");
  return propre;
}

function adresse(valeur: unknown): string {
  if (typeof valeur !== "string") throw new CourrielInvalide("Adresse invalide.");
  const propre = valeur.trim();
  if (propre.length > 254 || !FORMAT_COURRIEL.test(propre)) {
    throw new CourrielInvalide("Adresse invalide.");
  }
  return propre;
}

// Chaque modèle ne garde que ses champs, vérifiés et nettoyés : c'est ce qui entre en file.
const valideurs: { [M in Modele]: (d: Record<string, unknown>) => DonneesCourriel[M] } = {
  ouverture: (d) => ({
    ...personne(d),
    le: date(d.le),
    pays: facultatif(d.pays, 2),
    navigateur: facultatif(d.navigateur, 40),
  }),
  essai_refuse: (d) => ({
    ...personne(d),
    motif: motif(d.motif),
    finLe: date(d.finLe),
    le: date(d.le),
  }),
  alerte: (d) => ({ refus: entier(d.refus), depuis: date(d.depuis), jusqua: date(d.jusqua) }),
  contact: (d) => ({
    nom: nom(d.nom),
    courriel: adresse(d.courriel),
    message: texte(d.message, 5000, true),
    le: date(d.le),
  }),
};

function valider<M extends Modele>(modele: M, donnees: unknown): DonneesCourriel[M] {
  if (!Object.hasOwn(valideurs, modele)) throw new CourrielInvalide("Modèle inconnu.");
  return valideurs[modele](objet(donnees));
}

function quel(lien: { lienId: string; destinataire: string; organisation: string | null }) {
  const qui = lien.organisation ? `${lien.destinataire}, ${lien.organisation}` : lien.destinataire;
  return `${lien.lienId} (${qui})`;
}

const redacteurs: { [M in Modele]: (d: DonneesCourriel[M]) => MessageCourriel } = {
  ouverture: (d) => ({
    sujet: "Espace privé : lien ouvert",
    texte: [
      `Le lien ${quel(d)} vient d'être ouvert pour la première fois.`,
      "",
      `Date : ${dateParis.format(d.le)}`,
      `Pays : ${d.pays ?? "inconnu"}`,
      `Navigateur : ${d.navigateur ?? "inconnu"}`,
    ].join("\n"),
  }),
  essai_refuse: (d) => ({
    sujet: "Espace privé : essai sur un lien inactif",
    texte: [
      `Le lien ${quel(d)}, ${d.motif === "revoque" ? "révoqué" : "expiré"} le ${dateParis.format(d.finLe)}, a été essayé le ${dateParis.format(d.le)}.`,
      "",
      "Tu peux le prolonger avec la commande liens si l'accès doit reprendre.",
    ].join("\n"),
  }),
  alerte: (d) => ({
    sujet: "Espace privé : essais refusés en nombre",
    texte: [
      `${d.refus} essais d'accès refusés entre le ${dateParis.format(d.depuis)} et le ${dateParis.format(d.jusqua)}.`,
      "",
      "La limitation de débit reste active. Cette alerte part au plus une fois par heure.",
    ].join("\n"),
  }),
  contact: (d) => ({
    sujet: "Message depuis nclsmgr.com",
    repondreA: d.courriel,
    texte: [
      `Nom : ${d.nom}`,
      `Adresse : ${d.courriel}`,
      `Date : ${dateParis.format(d.le)}`,
      "",
      d.message,
    ].join("\n"),
  }),
};

/** Rédige le courriel d'un modèle à partir de ses données, revérifiées à chaque fois. */
export function rediger<M extends Modele>(modele: M, donnees: unknown): MessageCourriel {
  return redacteurs[modele](valider(modele, donnees));
}

/**
 * Met un courriel en file avec ses données vérifiées. Les messages de contact, seuls à venir
 * du public, sont refusés au-delà de MAX_CONTACTS_EN_ATTENTE en attente (FileSaturee).
 */
export function mettreEnFile<M extends Modele>(
  db: Base,
  modele: M,
  donnees: DonneesCourriel[M],
  maintenant: number,
): number {
  const verifiees = valider(modele, donnees);
  return db
    .transaction(() => {
      if (modele === "contact") {
        const { n } = db
          .prepare<[], { n: number }>(
            `SELECT count(*) AS n FROM courriels WHERE modele = 'contact' AND ${EN_ATTENTE}`,
          )
          .get() as { n: number };
        if (n >= MAX_CONTACTS_EN_ATTENTE) throw new FileSaturee("Trop de messages en attente.");
      }
      const { lastInsertRowid } = db
        .prepare("INSERT INTO courriels (modele, donnees, cree_le) VALUES (?, ?, ?)")
        .run(modele, JSON.stringify(verifiees), maintenant);
      return Number(lastInsertRowid);
    })
    .immediate();
}

export type CourrielEnAttente = { id: number; modele: Modele; donnees: string; essais: number };

/**
 * Courriels prêts à partir, dans la limite de MAX_PAR_HEURE envois sur une heure glissante.
 * Les alertes passent d'abord, les messages de contact en dernier.
 */
export function courrielsAEnvoyer(db: Base, maintenant: number): CourrielEnAttente[] {
  const { n } = db
    .prepare<[number], { n: number }>("SELECT count(*) AS n FROM courriels WHERE envoye_le > ?")
    .get(maintenant - HEURE) as { n: number };
  const place = MAX_PAR_HEURE - n;
  if (place <= 0) return [];
  return db
    .prepare<[number, number], CourrielEnAttente>(
      `SELECT id, modele, donnees, essais FROM courriels
       WHERE ${EN_ATTENTE} AND (prochain_le IS NULL OR prochain_le <= ?)
       ORDER BY CASE modele WHEN 'alerte' THEN 0 WHEN 'contact' THEN 2 ELSE 1 END, cree_le, id
       LIMIT ?`,
    )
    .all(maintenant, place);
}

/** Réserve un courriel juste avant son envoi ; faux s'il vient d'être pris ailleurs. */
export function reserver(db: Base, id: number, maintenant: number): boolean {
  return (
    db
      .prepare(
        `UPDATE courriels SET prochain_le = ?
         WHERE id = ? AND ${EN_ATTENTE} AND (prochain_le IS NULL OR prochain_le <= ?)`,
      )
      .run(maintenant + RESERVATION, id, maintenant).changes === 1
  );
}

export function marquerEnvoye(db: Base, id: number, maintenant: number): void {
  db.prepare("UPDATE courriels SET envoye_le = ?, prochain_le = NULL WHERE id = ?").run(
    maintenant,
    id,
  );
}

/**
 * Après un échec d'envoi, le prochain essai attend 2, 4, 8... minutes, jusqu'à 6 heures.
 * Un échec d'envoi n'est jamais définitif : la purge retire le courriel au bout de 7 jours.
 */
export function marquerEchec(db: Base, id: number, maintenant: number): void {
  db.prepare(
    `UPDATE courriels SET essais = essais + 1,
       prochain_le = ? + min(60000 << min(essais + 1, 20), ?)
     WHERE id = ?`,
  ).run(maintenant, DELAI_MAX, id);
}

/** Un courriel dont les données ne se relisent plus ne repartira jamais. */
export function abandonner(db: Base, id: number, maintenant: number): void {
  db.prepare("UPDATE courriels SET abandonne_le = ?, prochain_le = NULL WHERE id = ?").run(
    maintenant,
    id,
  );
}
