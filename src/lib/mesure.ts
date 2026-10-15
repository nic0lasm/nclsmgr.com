// Mesure d'audience Umami, auto-hébergée : ni cookie, ni adresse IP conservée.
// Les pages de l'espace privé ne sont jamais mesurées, et ni la requête ni le fragment
// (qui porte le jeton d'accès) ne quittent le navigateur.

export const FILTRE_MESURE = "nclsmgrMesure";

const IDENTIFIANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Identifiant du site dans Umami, ou null si la mesure n'est pas activée. */
export function identifiantMesure(valeur = process.env.UMAMI_SITE_ID): string | null {
  return valeur && IDENTIFIANT.test(valeur) ? valeur : null;
}

/** Chemins jamais mesurés : accès par lien personnel et espace privé. */
export const CHEMINS_PRIVES = /^\/(fr|en)\/(p|espace)(\/|$)/;

// Appelé par le script Umami avant chaque envoi : renvoyer null annule l'envoi.
export const filtreMesureScript = `window.${FILTRE_MESURE}=function(t,p){try{return ${CHEMINS_PRIVES}.test(new URL(p.url,location.href).pathname)?null:p}catch(e){return null}}`;
