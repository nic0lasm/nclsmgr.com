// En-têtes des chemins de l'espace privé, partagés par next.config.ts et les routes.
// Ils sont à doubler par Caddy selon le chemin (spécification transmise au fil qui gère
// deploy/), pour que la protection tienne si l'une des deux couches les oublie.
// Pas de « server-only » ici : next.config.ts importe ce fichier.

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
  const langue = ":lang(fr|en)";
  return [
    { source: `/${langue}/p`, headers: liste(EN_TETES_PAGE_ACCES) },
    { source: `/${langue}/p/:chemin((?!acces$).+)`, headers: liste(EN_TETES_PAGE_ACCES) },
    { source: `/${langue}/p/acces`, headers: liste(EN_TETES_ROUTES) },
    { source: `/${langue}/espace`, headers: liste(EN_TETES_ESPACE) },
    { source: `/${langue}/espace/:chemin((?!sortie$).+)`, headers: liste(EN_TETES_ESPACE) },
    { source: `/${langue}/espace/sortie`, headers: liste(EN_TETES_ROUTES) },
  ];
}
