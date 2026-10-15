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
/** Au-delà de ce nombre de refus sur une heure glissante, une alerte part (au plus une par heure). */
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
  if (n >= MAX_LIGNES_PAR_JOUR) return false;
  db.prepare(
    `INSERT INTO consultations (lien_id, type, document, le, pays, navigateur)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(lienId, type, document, maintenant, contexte.pays, contexte.navigateur);
  return true;
}

/**
 * Met une notification en file dans la transaction en cours. Des données que le valideur des
 * courriels refuse (nom qui s'allonge à la normalisation, par exemple) ne doivent pas faire
 * perdre la ligne du journal : seule la notification est abandonnée.
 */
function notifier(envoyer: () => void): boolean {
  try {
    envoyer();
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
        notifier(() =>
          mettreEnFile(
            db,
            "ouverture",
            {
              lienId: lien.id,
              destinataire: lien.destinataire,
              organisation: lien.organisation,
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
 * file des courriels (gardés 7 jours) : des essais répétés toutes les 23 heures notifient
 * quand même une fois par jour.
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
      const revoque = lien.revoqueLe !== null;
      const notifie = notifier(() =>
        mettreEnFile(
          db,
          "essai_refuse",
          {
            lienId: lien.id,
            destinataire: lien.destinataire,
            organisation: lien.organisation,
            motif: revoque ? "revoque" : "expire",
            finLe: revoque ? (lien.revoqueLe as number) : lien.expireLe,
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
 * Refus de la route d'accès sur une heure glissante, toutes IP confondues, en tranches d'une
 * minute (60 entrées au plus). En mémoire : l'application tourne en un seul processus, comme
 * la limitation de débit ; un redémarrage remet seulement le compte à zéro.
 */
export class CompteurRefus {
  private readonly tranches = new Map<number, number>();
  /** Date de la dernière alerte connue, pour éviter de relire la base à chaque refus. */
  derniereAlerte: number | null = null;

  ajouter(maintenant: number): { total: number; depuis: number } {
    const tranche = Math.floor(maintenant / MINUTE);
    const premiere = tranche - HEURE / MINUTE + 1;
    for (const cle of this.tranches.keys()) if (cle < premiere) this.tranches.delete(cle);
    this.tranches.set(tranche, (this.tranches.get(tranche) ?? 0) + 1);
    let total = 0;
    let depuis = tranche;
    for (const [cle, nombre] of this.tranches) {
      total += nombre;
      depuis = Math.min(depuis, cle);
    }
    return { total, depuis: depuis * MINUTE };
  }
}

/**
 * Compte un refus et met une alerte en file au-delà de SEUIL_ALERTE refus sur l'heure. La file
 * des courriels fait foi pour « au plus une par heure » : une alerte mise en file avant un
 * redémarrage compte aussi.
 */
export function noterRefus(db: Base, compteur: CompteurRefus, maintenant: number): boolean {
  const { total, depuis } = compteur.ajouter(maintenant);
  if (total <= SEUIL_ALERTE) return false;
  if (compteur.derniereAlerte !== null && maintenant - compteur.derniereAlerte < HEURE) {
    return false;
  }
  return db
    .transaction(() => {
      const recente = db
        .prepare<[number], { cree_le: number }>(
          `SELECT cree_le FROM courriels WHERE modele = 'alerte' AND cree_le > ?
           ORDER BY cree_le DESC LIMIT 1`,
        )
        .get(maintenant - HEURE);
      if (recente) {
        compteur.derniereAlerte = recente.cree_le;
        return false;
      }
      mettreEnFile(db, "alerte", { refus: total, depuis, jusqua: maintenant }, maintenant);
      compteur.derniereAlerte = maintenant;
      return true;
    })
    .immediate();
}
