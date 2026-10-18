// En-têtes des chemins de l'espace privé, partagés par next.config.ts et les routes.
// Caddy les pose aussi sur les mêmes chemins (deploy/Caddyfile), pour que la protection tienne
// si l'une des deux couches les oublie.
// Pas de « server-only » ici : next.config.ts importe ce fichier, d'où l'import relatif.

import { locales } from "../i18n";

// Langues du site pour les motifs de chemin : fr|en.
const LANGUES = locales.join("|");

/** /fr/p, /en/p et tout autre chemin sous /p : page identique pour tous, sans donnée. */
export const EN_TETES_PAGE_ACCES = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "same-origin",
} as const;

/** Routes POST : échange du jeton et sortie de l'espace. */
export const EN_TETES_ROUTES = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
} as const;

/** /fr/espace, /en/espace et leurs sous-pages : session vérifiée à chaque requête. */
export const EN_TETES_ESPACE = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
  "Referrer-Policy": "same-origin",
} as const;

/**
 * /fr/espace/documents/<id> : en plus de ceux de l'espace, pour le PDF comme pour le 404.
 *
 * La protection du PDF tient au type application/pdf, à nosniff, à la signature %PDF- vérifiée
 * par la route et à des PDF de confiance (produits par l'administrateur, sans JavaScript ni
 * action, ce que la route vérifie aussi pour les objets en clair). Elle ne tient pas à la
 * politique de sécurité :
 * sous Chromium, la visionneuse PDF remplace la réponse par sa propre page, à laquelle ni
 * default-src 'none' ni sandbox ne s'appliquent, et le JavaScript d'un PDF y est exécuté.
 *
 * La politique fermée reste une défense de plus pour les navigateurs qui l'appliquent au
 * document : aucun chargement, aucun cadre parent, aucun formulaire. sandbox allow-downloads
 * garde l'affichage du PDF (Chromium, Firefox, Safari 18.4 et suivants) et le bouton
 * d'enregistrement de la visionneuse.
 */
export const EN_TETES_DOCUMENT = {
  ...EN_TETES_ESPACE,
  "Content-Security-Policy":
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-downloads",
  "X-Content-Type-Options": "nosniff",
  "Accept-Ranges": "none",
} as const;

/**
 * Chemins des documents réservés. Le proxy y remplace sa politique de sécurité (nonce, scripts)
 * par celle des documents : sans cela, la sienne écraserait celle que pose la route.
 */
export const CHEMIN_DOCUMENTS = new RegExp(`^/(?:${LANGUES})/espace/documents(?:/|$)`);

type EnTetes = Record<string, string>;

function liste(enTetes: EnTetes) {
  return Object.entries(enTetes).map(([key, value]) => ({ key, value }));
}

/**
 * Règles pour la fonction headers() de next.config.ts. Les routes POST sont exclues des règles
 * générales par une anticipation négative : elles ne reçoivent que leurs propres en-têtes, que
 * les routes posent aussi elles-mêmes.
 */
export function reglesEnTetesEspace() {
  const langue = `:lang(${LANGUES})`;
  return [
    { source: `/${langue}/p`, headers: liste(EN_TETES_PAGE_ACCES) },
    { source: `/${langue}/p/:chemin((?!acces$).+)`, headers: liste(EN_TETES_PAGE_ACCES) },
    { source: `/${langue}/p/acces`, headers: liste(EN_TETES_ROUTES) },
    { source: `/${langue}/espace`, headers: liste(EN_TETES_ESPACE) },
    { source: `/${langue}/espace/:chemin((?!sortie$).+)`, headers: liste(EN_TETES_ESPACE) },
    { source: `/${langue}/espace/sortie`, headers: liste(EN_TETES_ROUTES) },
  ];
}
