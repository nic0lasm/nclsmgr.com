import "server-only";
import type { Base } from "./base";
import { CourrielInvalide, mettreEnFile } from "./courriels";
import { JOUR, type Lien } from "./liens";

// Journal des consultations : une ligne par ouverture, par essai sur un lien inactif et par
// lecture de document. Seuls la date, le pays (deux lettres) et une famille de navigateur sont
// gardés : jamais d'adresse IP ni de chaîne User-Agent complète.

const HEURE = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** Une seconde lecture du même document par le même lien dans ce délai n'est pas notée. */
export const DOUBLON_DOCUMENT = 10 * MINUTE;
/**
 * Au plus tant de lignes par lien, par type et sur 24 heures glissantes : rejouer un jeton,
 * actif ou non, ne fait pas grossir la base sans fin. Un usage normal n'en approche pas.
 */
export const MAX_LIGNES_PAR_JOUR = 50;
/**
 * Au-delà de MAX_LIGNES_PAR_JOUR, lignes de plus permises sur 24 heures, une par couple
 * (pays, navigateur) nouveau pour ce lien et ce type.
 */
export const MAX_LIGNES_NOUVELLES = 20;
/**
 * Au-delà de ce nombre d'échanges refusés sur une heure glissante, une alerte part (au plus une
 * par heure). Avec 10 essais par IP et par 10 minutes, il faut au moins 4 adresses pour le
 * franchir : c'est une campagne distribuée.
 */
export const SEUIL_ALERTE = 200;

export type ContexteVisite = { pays: string | null; navigateur: string };

/**
 * Pays fourni par Cloudflare (CF-IPCountry) : deux lettres majuscules, sinon null. XX (pays
 * inconnu) et T1 (Tor) ne disent rien du pays.
 */
export function paysDepuis(enTete: string | null): string | null {
  const pays = enTete?.trim() ?? "";
  return /^[A-Z]{2}$/.test(pays) && pays !== "XX" ? pays : null;
}

// L'ordre compte : Edge, Opera et Samsung Internet se déclarent aussi Chrome et Safari ;
// Chrome se déclare aussi Safari ; iOS se déclare « like Mac OS X » et Android, Linux.
const NAVIGATEURS: readonly [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOPiOS\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrom(?:e|ium)\/|\bCriOS\//, "Chrome"],
];
const SYSTEMES: readonly [RegExp, string][] = [
  [/\b(?:iPhone|iPad|iPod)\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMacintosh\b|\bMac OS X\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];
// Au-delà, la chaîne n'est pas lue : les expressions restent rapides quoi qu'envoie le client.
const LONGUEUR_LUE = 512;

function premier(texte: string, regles: readonly [RegExp, string][]): string | null {
  return regles.find(([motif]) => motif.test(texte))?.[1] ?? null;
}

/**
 * Famille de navigateur et système, déduits du User-Agent, par exemple « Firefox · Windows ».
 * Le résultat est pris dans une liste fixe : rien de la chaîne d'origine n'est recopié.
 */
export function navigateurDepuis(userAgent: string | null): string {
  const texte = (userAgent ?? "").slice(0, LONGUEUR_LUE);
  let navigateur = premier(texte, NAVIGATEURS);
  if (!navigateur && /\bSafari\//.test(texte) && /\bVersion\//.test(texte)) navigateur = "Safari";
  const systeme = premier(texte, SYSTEMES);
  if (!navigateur && !systeme) return "Autre";
  return `${navigateur ?? "Autre"} · ${systeme ?? "Autre"}`;
}

export function contexteDepuis(enTetes: Headers): ContexteVisite {
  return {
    pays: paysDepuis(enTetes.get("cf-ipcountry")),
    navigateur: navigateurDepuis(enTetes.get("user-agent")),
  };
}

type TypeConsultation = "ouverture" | "document" | "essai_refuse";

/**
 * Écrit une ligne au journal, dans la limite de MAX_LIGNES_PAR_JOUR par lien et par type sur
 * 24 heures glissantes. Au-delà, seule la première ligne d'un couple (pays, navigateur) pas
 * encore vu pour ce lien et ce type sur ces 24 heures est écrite, jusqu'à
 * MAX_LIGNES_NOUVELLES de plus : un lien qui circule reste visible au journal.
 */
function inserer(
  db: Base,
  lienId: string,
  type: TypeConsultation,
  document: string | null,
  contexte: ContexteVisite,
  maintenant: number,
): boolean {
  const { n } = db
    .prepare<[string, string, number], { n: number }>(
      "SELECT count(*) AS n FROM consultations WHERE lien_id = ? AND type = ? AND le > ?",
    )
    .get(lienId, type, maintenant - JOUR) as { n: number };
  if (n >= MAX_LIGNES_PAR_JOUR + MAX_LIGNES_NOUVELLES) return false;
  if (n >= MAX_LIGNES_PAR_JOUR) {
    const vu = db
      .prepare<[string, string, number, string | null, string], { id: number }>(
        `SELECT id FROM consultations
         WHERE lien_id = ? AND type = ? AND le > ? AND pays IS ? AND navigateur IS ?
         LIMIT 1`,
      )
      .get(lienId, type, maintenant - JOUR, contexte.pays, contexte.navigateur);
    if (vu) return false;
  }
  db.prepare(
    `INSERT INTO consultations (lien_id, type, document, le, pays, navigateur)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(lienId, type, document, maintenant, contexte.pays, contexte.navigateur);
  return true;
}

type Identite = { destinataire: string; organisation: string | null };

/** Remplace le nom d'un lien que le valideur des courriels refuse. */
export const NOM_NON_AFFICHABLE = "(nom non affichable)";

/**
 * Met une notification en file dans la transaction en cours. Si le valideur des courriels
 * refuse le nom ou l'organisation du lien (nom accepté en NFC à la création mais qui s'allonge
 * en NFKC, par exemple), la notification part quand même, avec NOM_NON_AFFICHABLE et sans
 * organisation. Dans tous les cas, la ligne du journal est gardée.
 */
function notifier(lien: Lien, envoyer: (identite: Identite) => void): boolean {
  try {
    envoyer({ destinataire: lien.destinataire, organisation: lien.organisation });
    return true;
  } catch (erreur) {
    if (!(erreur instanceof CourrielInvalide)) throw erreur;
  }
  console.error("Espace privé : nom du lien refusé par le valideur des courriels, notifié sans.");
  try {
    envoyer({ destinataire: NOM_NON_AFFICHABLE, organisation: null });
    return true;
  } catch (erreur) {
    if (!(erreur instanceof CourrielInvalide)) throw erreur;
    console.error("Espace privé : notification refusée par le valideur des courriels.");
    return false;
  }
}

/**
 * Ouverture réussie : une ligne au journal ; à la première ouverture seulement, la date
 * ouvert_le du lien et une notification à Nico. La condition « ouvert_le IS NULL » est
 * vérifiée par la base : deux premières ouvertures simultanées ne notifient qu'une fois.
 */
export function noterOuverture(
  db: Base,
  lien: Lien,
  contexte: ContexteVisite,
  maintenant: number,
): { premiere: boolean } {
  return db
    .transaction(() => {
      inserer(db, lien.id, "ouverture", null, contexte, maintenant);
      const premiere =
        db
          .prepare("UPDATE liens SET ouvert_le = ? WHERE id = ? AND ouvert_le IS NULL")
          .run(maintenant, lien.id).changes === 1;
      if (premiere) {
        notifier(lien, (identite) =>
          mettreEnFile(
            db,
            "ouverture",
            {
              lienId: lien.id,
              ...identite,
              le: maintenant,
              pays: contexte.pays,
              navigateur: contexte.navigateur,
            },
            maintenant,
          ),
        );
      }
      return { premiere };
    })
    .immediate();
}

/**
 * Essai avec le jeton d'un lien expiré ou révoqué : une ligne au journal, et une notification
 * au plus par lien et par 24 heures glissantes. La dernière notification est cherchée dans la
 * file des courriels (gardés 7 jours), par l'index courriels_modele : des essais répétés
 * toutes les 23 heures notifient quand même une fois par jour.
 */
export function noterEssaiRefuse(
  db: Base,
  lien: Lien,
  contexte: ContexteVisite,
  maintenant: number,
): { notifie: boolean } {
  return db
    .transaction(() => {
      inserer(db, lien.id, "essai_refuse", null, contexte, maintenant);
      const dejaNotifie = db
        .prepare<[number, string], { id: number }>(
          `SELECT id FROM courriels
           WHERE modele = 'essai_refuse' AND cree_le > ? AND json_extract(donnees, '$.lienId') = ?
           LIMIT 1`,
        )
        .get(maintenant - JOUR, lien.id);
      if (dejaNotifie) return { notifie: false };
      const notifie = notifier(lien, (identite) =>
        mettreEnFile(
          db,
          "essai_refuse",
          {
            lienId: lien.id,
            ...identite,
            motif: lien.revoqueLe !== null ? "revoque" : "expire",
            finLe: lien.revoqueLe ?? lien.expireLe,
            le: maintenant,
          },
          maintenant,
        ),
      );
      return { notifie };
    })
    .immediate();
}

/**
 * Lecture d'un document de l'espace. Les lecteurs PDF font plusieurs requêtes (Range) pour un
 * même fichier : une seconde lecture du même document par le même lien dans les 10 minutes
 * n'est pas notée. Rend vrai si une ligne a été écrite.
 */
export function noterDocument(
  db: Base,
  lienId: string,
  document: string,
  contexte: ContexteVisite,
  maintenant: number,
): boolean {
  return db
    .transaction(() => {
      const recente = db
        .prepare<[string, string, number], { id: number }>(
          `SELECT id FROM consultations
           WHERE lien_id = ? AND type = 'document' AND document = ? AND le > ?
           LIMIT 1`,
        )
        .get(lienId, document, maintenant - DOUBLON_DOCUMENT);
      if (recente) return false;
      return inserer(db, lienId, "document", document, contexte, maintenant);
    })
    .immediate();
}

/**
 * Échanges de jeton refusés sur une heure glissante, toutes IP confondues, en tranches d'une
 * minute (60 entrées au plus). En mémoire : l'application tourne en un seul processus, comme
 * la limitation de débit ; un redémarrage remet seulement le compte à zéro.
 */
export class CompteurRefus {
  private readonly tranches = new Map<number, number>();
  /** Avant cette date, la file n'est pas relue : alerte récente, ou recul après un essai. */
  private pasAvant = Number.NEGATIVE_INFINITY;

  ajouter(maintenant: number): { total: number; depuis: number } {
    const tranche = Math.floor(maintenant / MINUTE);
    const premiere = tranche - HEURE / MINUTE + 1;
    // Après un recul de l'horloge, les tranches postérieures à la tranche courante sont
    // retirées aussi : elles fausseraient le total et la date de début.
    for (const cle of this.tranches.keys()) {
      if (cle < premiere || cle > tranche) this.tranches.delete(cle);
    }
    this.tranches.set(tranche, (this.tranches.get(tranche) ?? 0) + 1);
    let total = 0;
    let depuis = tranche;
    for (const [cle, nombre] of this.tranches) {
      total += nombre;
      depuis = Math.min(depuis, cle);
    }
    return { total, depuis: depuis * MINUTE };
  }

  /** Vrai si la file des courriels peut être relue. Une échéance à plus d'une heure, laissée
   * par un recul de l'horloge, est ignorée. */
  peutRelire(maintenant: number): boolean {
    return maintenant >= this.pasAvant || this.pasAvant - maintenant > HEURE;
  }

  /** Pas de nouvelle lecture de la file avant cette date, et jamais plus d'une heure. */
  reporter(jusqua: number, maintenant: number): void {
    this.pasAvant = Math.min(jusqua, maintenant + HEURE);
  }
}

/** Après un essai d'alerte, la file n'est pas relue avant ce délai, même si l'essai a échoué. */
export const RECUL_ALERTE = MINUTE;

/**
 * Compte un échange refusé et met une alerte en file au-delà de SEUIL_ALERTE refus sur l'heure.
 * La file des courriels fait foi pour « au plus une par heure » : une alerte mise en file avant
 * un redémarrage compte aussi.
 */
export function noterRefus(db: Base, compteur: CompteurRefus, maintenant: number): boolean {
  const { total, depuis } = compteur.ajouter(maintenant);
  if (total <= SEUIL_ALERTE || !compteur.peutRelire(maintenant)) return false;
  // Le recul est posé avant la transaction : si l'écriture échoue (base verrouillée), les
  // refus suivants ne la retentent pas un par un.
  compteur.reporter(maintenant + RECUL_ALERTE, maintenant);
  return db
    .transaction(() => {
      const recente = db
        .prepare<[number], { cree_le: number }>(
          `SELECT cree_le FROM courriels WHERE modele = 'alerte' AND cree_le > ?
           ORDER BY cree_le DESC LIMIT 1`,
        )
        .get(maintenant - HEURE);
      if (recente) {
        compteur.reporter(recente.cree_le + HEURE, maintenant);
        return false;
      }
      mettreEnFile(db, "alerte", { refus: total, depuis, jusqua: maintenant }, maintenant);
      compteur.reporter(maintenant + HEURE, maintenant);
      return true;
    })
    .immediate();
}
