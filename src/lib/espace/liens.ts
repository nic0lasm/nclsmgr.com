import "server-only";
import { isLocale, type Locale } from "@/lib/i18n";
import type { Base } from "./base";
import { empreinte, estSecretBienForme, genererIdLien, genererSecret } from "./jetons";

export const profils = ["recruteur", "developpeur", "client", "partenaire"] as const;
export type Profil = (typeof profils)[number];

export const JOUR = 86_400_000;
export const DUREE_PAR_DEFAUT_JOURS = 30;
export const DUREE_MAX_JOURS = 180;

const LIMITES = { destinataire: 120, organisation: 120, message: 1000, note: 500 } as const;
const MAX_DOCUMENTS = 20;
const FORMAT_DOCUMENT = /^[a-z0-9][a-z0-9-]{0,39}$/;
// Caractères de contrôle, de format (invisibles, sens d'écriture), demi-paires et séparateurs
// de ligne refusés ; seul le message garde ses retours à la ligne.
const INTERDIT = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

export type Lien = {
  id: string;
  profil: Profil;
  langue: Locale;
  destinataire: string;
  organisation: string | null;
  message: string | null;
  documents: string[];
  note: string | null;
  creeLe: number;
  expireLe: number;
  revoqueLe: number | null;
  ouvertLe: number | null;
};

export type NouveauLien = {
  profil: Profil;
  langue: Locale;
  destinataire: string;
  organisation?: string;
  message?: string;
  documents?: string[];
  note?: string;
  dureeJours?: number;
};

export class DonneesInvalides extends Error {}

export type LigneLien = {
  id: string;
  profil: string;
  langue: string;
  destinataire: string;
  organisation: string | null;
  message: string | null;
  documents: string;
  note: string | null;
  cree_le: number;
  expire_le: number;
  revoque_le: number | null;
  ouvert_le: number | null;
};

export function colonnesLien(alias: string): string {
  return [
    "id",
    "profil",
    "langue",
    "destinataire",
    "organisation",
    "message",
    "documents",
    "note",
    "cree_le",
    "expire_le",
    "revoque_le",
    "ouvert_le",
  ]
    .map((colonne) => `${alias}.${colonne}`)
    .join(", ");
}

export function versLien(ligne: LigneLien): Lien {
  return {
    id: ligne.id,
    profil: ligne.profil as Profil,
    langue: ligne.langue as Locale,
    destinataire: ligne.destinataire,
    organisation: ligne.organisation,
    message: ligne.message,
    documents: JSON.parse(ligne.documents) as string[],
    note: ligne.note,
    creeLe: ligne.cree_le,
    expireLe: ligne.expire_le,
    revoqueLe: ligne.revoque_le,
    ouvertLe: ligne.ouvert_le,
  };
}

export function estActif(lien: Lien, maintenant: number): boolean {
  return lien.revoqueLe === null && maintenant < lien.expireLe;
}

// Les données viennent d'un JSON reçu par la commande liens : les types sont revérifiés ici.
function texte(valeur: unknown, champ: keyof typeof LIMITES, obligatoire: boolean): string | null {
  if (valeur !== undefined && valeur !== null && typeof valeur !== "string") {
    throw new DonneesInvalides(`Le champ ${champ} doit être un texte.`);
  }
  let propre = (valeur ?? "").normalize("NFC").trim();
  if (champ === "message") propre = propre.replace(/\r\n?/g, "\n");
  if (!propre) {
    if (obligatoire) throw new DonneesInvalides(`Le champ ${champ} est obligatoire.`);
    return null;
  }
  if (propre.length > LIMITES[champ]) {
    throw new DonneesInvalides(`Le champ ${champ} dépasse ${LIMITES[champ]} caractères.`);
  }
  if (INTERDIT.test(champ === "message" ? propre.replaceAll("\n", "") : propre)) {
    throw new DonneesInvalides(`Le champ ${champ} contient un caractère invisible ou de contrôle.`);
  }
  return propre;
}

function verifier(entree: NouveauLien) {
  if (!(profils as readonly unknown[]).includes(entree.profil)) {
    throw new DonneesInvalides("Profil inconnu.");
  }
  if (typeof entree.langue !== "string" || !isLocale(entree.langue)) {
    throw new DonneesInvalides("Langue inconnue.");
  }
  const duree: unknown = entree.dureeJours ?? DUREE_PAR_DEFAUT_JOURS;
  if (!Number.isInteger(duree) || (duree as number) < 1 || (duree as number) > DUREE_MAX_JOURS) {
    throw new DonneesInvalides(
      `La durée doit être un nombre entier de jours entre 1 et ${DUREE_MAX_JOURS}.`,
    );
  }
  const documents: unknown = entree.documents ?? [];
  if (
    !Array.isArray(documents) ||
    documents.length > MAX_DOCUMENTS ||
    new Set(documents).size !== documents.length ||
    !documents.every((document) => typeof document === "string" && FORMAT_DOCUMENT.test(document))
  ) {
    throw new DonneesInvalides("Liste de documents invalide.");
  }
  return {
    profil: entree.profil,
    langue: entree.langue,
    destinataire: texte(entree.destinataire, "destinataire", true) as string,
    organisation: texte(entree.organisation, "organisation", false),
    message: texte(entree.message, "message", false),
    note: texte(entree.note, "note", false),
    documents: documents as string[],
    duree: duree as number,
  };
}

/**
 * Crée un lien et rend son jeton, qui n'est jamais stocké : seule son empreinte l'est.
 * L'appelant le transmet directement à Nico puis l'oublie.
 */
export function creerLien(
  db: Base,
  entree: NouveauLien,
  maintenant: number,
): { lien: Lien; jeton: string } {
  const donnees = verifier(entree);
  const jeton = genererSecret();
  const inserer = db.prepare(
    `INSERT INTO liens (id, jeton_sha256, profil, langue, destinataire, organisation, message,
       documents, note, cree_le, expire_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const expireLe = maintenant + donnees.duree * JOUR;
  // L'identifiant est court : en cas de collision, on en tire un autre.
  for (let essai = 0; essai < 5; essai++) {
    const id = genererIdLien();
    try {
      inserer.run(
        id,
        empreinte(jeton),
        donnees.profil,
        donnees.langue,
        donnees.destinataire,
        donnees.organisation,
        donnees.message,
        JSON.stringify(donnees.documents),
        donnees.note,
        maintenant,
        expireLe,
      );
    } catch (erreur) {
      if ((erreur as { code?: string }).code === "SQLITE_CONSTRAINT_PRIMARYKEY") continue;
      throw erreur;
    }
    return {
      jeton,
      lien: {
        id,
        profil: donnees.profil,
        langue: donnees.langue,
        destinataire: donnees.destinataire,
        organisation: donnees.organisation,
        message: donnees.message,
        documents: donnees.documents,
        note: donnees.note,
        creeLe: maintenant,
        expireLe,
        revoqueLe: null,
        ouvertLe: null,
      },
    };
  }
  throw new Error("Impossible de tirer un identifiant de lien libre.");
}

export type Verification = { valide: true; lien: Lien } | { valide: false; lien: Lien | null };

/**
 * Une seule lecture par empreinte, puis expiration et révocation testées en mémoire. Le lien
 * refusé n'est rendu que pour le journal : la réponse au visiteur doit rester identique dans
 * tous les cas d'échec.
 */
export function verifierJeton(db: Base, jeton: unknown, maintenant: number): Verification {
  if (!estSecretBienForme(jeton)) return { valide: false, lien: null };
  const ligne = db
    .prepare<[Buffer], LigneLien>(
      `SELECT ${colonnesLien("l")} FROM liens l WHERE l.jeton_sha256 = ?`,
    )
    .get(empreinte(jeton));
  if (!ligne) return { valide: false, lien: null };
  const lien = versLien(ligne);
  return estActif(lien, maintenant) ? { valide: true, lien } : { valide: false, lien };
}

/** Révoque le lien et ferme ses sessions dans la même transaction. */
export function revoquerLien(db: Base, id: string, maintenant: number): boolean {
  const revoquer = db.transaction(() => {
    const { changes } = db
      .prepare("UPDATE liens SET revoque_le = ? WHERE id = ? AND revoque_le IS NULL")
      .run(maintenant, id);
    db.prepare("DELETE FROM sessions WHERE lien_id = ?").run(id);
    return changes > 0;
  });
  return revoquer.immediate();
}
