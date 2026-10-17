import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Délai minimal de remplissage du formulaire de contact, sans JavaScript ni cookie. La page
// glisse dans le formulaire l'heure de son affichage, signée avec une clé tirée au démarrage du
// processus. Un envoi plus rapide qu'un visiteur ne peut écrire, ou sans signature valide, est
// refusé. Un redémarrage invalide les formulaires déjà affichés : le visiteur renvoie le sien,
// qui revient avec un jeton neuf et ses valeurs intactes.

/** En dessous, personne n'a eu le temps de lire la page et d'écrire un message. */
export const DELAI_MIN = 3000;
/** Au-delà, le formulaire est trop ancien. */
export const AGE_MAX = 24 * 60 * 60 * 1000;

const globale = globalThis as typeof globalThis & { cleJetonContact?: Buffer };
const cle = (globale.cleJetonContact ??= randomBytes(32));

function signer(horodatage: string): Buffer {
  return createHmac("sha256", cle).update(`contact:${horodatage}`).digest();
}

/** Jeton à placer dans le formulaire au moment de l'afficher. */
export function emettreJeton(maintenant = Date.now()): string {
  const horodatage = Math.floor(maintenant).toString(36);
  return `${horodatage}.${signer(horodatage).toString("base64url")}`;
}

/** Vrai si le jeton a été émis par ce processus, il y a plus de DELAI_MIN et moins d'AGE_MAX. */
export function jetonValide(jeton: unknown, maintenant: number): boolean {
  if (typeof jeton !== "string" || jeton.length > 100) return false;
  const [horodatage = "", signature = "", ...reste] = jeton.split(".");
  if (reste.length > 0 || !/^[0-9a-z]{1,12}$/.test(horodatage)) return false;
  const recue = Buffer.from(signature, "base64url");
  const attendue = signer(horodatage);
  if (recue.length !== attendue.length || !timingSafeEqual(recue, attendue)) return false;
  const age = maintenant - Number.parseInt(horodatage, 36);
  return age >= DELAI_MIN && age <= AGE_MAX;
}
