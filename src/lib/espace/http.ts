import "server-only";
import { NOM_COOKIE } from "./sessions";

/**
 * Contrôle anti-CSRF des POST de l'espace. Les navigateurs récents envoient Sec-Fetch-Site :
 * seule la valeur same-origin passe. À défaut (navigateur ancien), l'en-tête Origin doit
 * désigner le même hôte que l'en-tête Host. Sans l'un ni l'autre, la requête est refusée.
 */
export function origineAutorisee(enTetes: Headers): boolean {
  const site = enTetes.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const origine = enTetes.get("origin");
  const hote = enTetes.get("host");
  if (!origine || !hote) return false;
  try {
    const url = new URL(origine);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.host === hote.trim().toLowerCase()
    );
  } catch {
    return false;
  }
}

/** Cookie de session : __Host- impose Secure, Path=/ et l'absence de Domain. */
export function cookieSession(valeur: string, expireLe: number, maintenant: number): string {
  const maxAge = Math.max(0, Math.floor((expireLe - maintenant) / 1000));
  return `${NOM_COOKIE}=${valeur}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

/** Même cookie, vidé et expiré : le navigateur le supprime. */
export function cookieEfface(): string {
  return `${NOM_COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export const TAILLE_MAX_CORPS = 1024;

/**
 * Lit un corps JSON d'au plus 1 Kio. Rend undefined pour tout corps absent, trop long, d'un
 * autre type ou illisible : l'appelant n'a pas à distinguer ces cas.
 */
export async function lireCorpsJson(requete: Request): Promise<unknown> {
  const type = requete.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/json" || !requete.body) return undefined;
  const longueur = requete.headers.get("content-length");
  if (longueur !== null && !(Number(longueur) <= TAILLE_MAX_CORPS)) return undefined;
  const lecteur = requete.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > TAILLE_MAX_CORPS) {
      await lecteur.cancel();
      return undefined;
    }
    morceaux.push(value);
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(morceaux)));
  } catch {
    return undefined;
  }
}

/** Délai plancher : la réponse ne part pas avant `plancherMs` après `debut`. */
export async function attendreAuMoins(debut: number, plancherMs: number): Promise<void> {
  const reste = debut + plancherMs - performance.now();
  if (reste > 0) await new Promise((resoudre) => setTimeout(resoudre, reste));
}
