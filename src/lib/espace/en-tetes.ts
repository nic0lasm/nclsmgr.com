// En-têtes des chemins de l'espace privé, partagés par next.config.ts et les routes.
// Caddy pose les mêmes selon le chemin : la protection reste en place si l'une des deux couches
// les oublie. Pas de « server-only » ici : next.config.ts importe ce fichier.

/** /fr/p et /en/p : page identique pour tous, sans donnée. */
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
 * Règles pour la fonction headers() de next.config.ts. Quand plusieurs règles posent le même
 * en-tête, la dernière l'emporte : les routes POST viennent donc après l'espace.
 * Next.js remplace Cache-Control sur les pages rendues à la requête par une valeur qui contient
 * déjà private et no-store ; les routes posent le leur elles-mêmes.
 */
export function reglesEnTetesEspace() {
  const langue = ":lang(fr|en)";
  return [
    { source: `/${langue}/p`, headers: liste(EN_TETES_PAGE_ACCES) },
    { source: `/${langue}/espace`, headers: liste(EN_TETES_ESPACE) },
    { source: `/${langue}/espace/:chemin*`, headers: liste(EN_TETES_ESPACE) },
    { source: `/${langue}/p/acces`, headers: liste(EN_TETES_ROUTES) },
    { source: `/${langue}/espace/sortie`, headers: liste(EN_TETES_ROUTES) },
  ];
}
