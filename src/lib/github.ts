// Récupération des dépôts publics au moment du build. Le navigateur n'appelle jamais GitHub
// et le serveur en production n'a ni jeton ni accès sortant : il sert l'instantané produit ici.

export const PROPRIETAIRE = "nic0lasm";
const API = `https://api.github.com/users/${PROPRIETAIRE}/repos?type=owner&sort=pushed&per_page=100`;
const PREFIXE_DEPOT = `https://github.com/${PROPRIETAIRE}/`;
const MAX_TOPICS = 5;

export type Depot = {
  nom: string;
  depot: string;
  description: string | null;
  url: string;
  siteWeb: string | null;
  langage: string | null;
  topics: string[];
  etoiles: number;
  forks: number;
  actifLe: string;
  licence: string | null;
  fork: boolean;
  archive: boolean;
};

export type Instantane = {
  genereLe: string;
  depots: Depot[];
};

type Brut = Record<string, unknown>;

function texteOuNull(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur.trim() !== "" ? valeur.trim() : null;
}

function entier(valeur: unknown): number {
  return typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 0 ? valeur : 0;
}

function urlHttps(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  try {
    const url = new URL(valeur);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Ne garde que les champs affichés. Un dépôt privé, ou dont l'adresse ne pointe pas vers
// le compte attendu, est écarté plutôt que de faire confiance à la réponse.
export function lireDepot(brut: unknown): Depot | null {
  if (typeof brut !== "object" || brut === null) return null;
  const r = brut as Brut;
  const nom = texteOuNull(r.name);
  const depot = texteOuNull(r.full_name);
  const url = texteOuNull(r.html_url);
  const actifLe = texteOuNull(r.pushed_at);
  if (!nom || !depot || !url || !actifLe) return null;
  if (r.private !== false) return null;
  if (depot !== `${PROPRIETAIRE}/${nom}` || url !== PREFIXE_DEPOT + nom) return null;
  if (Number.isNaN(Date.parse(actifLe))) return null;

  const licence =
    typeof r.license === "object" && r.license !== null
      ? texteOuNull((r.license as Brut).spdx_id)
      : null;
  const topics = Array.isArray(r.topics)
    ? r.topics.filter((t): t is string => typeof t === "string" && /^[a-z0-9-]{1,50}$/.test(t))
    : [];

  return {
    nom,
    depot,
    description: texteOuNull(r.description),
    url,
    siteWeb: urlHttps(r.homepage),
    langage: texteOuNull(r.language),
    topics: topics.slice(0, MAX_TOPICS),
    etoiles: entier(r.stargazers_count),
    forks: entier(r.forks_count),
    actifLe,
    licence: licence === "NOASSERTION" ? null : licence,
    fork: r.fork === true,
    archive: r.archived === true,
  };
}

export function lireReponse(json: unknown): Depot[] {
  if (!Array.isArray(json)) throw new Error("Réponse GitHub inattendue : une liste était attendue");
  return json
    .map(lireDepot)
    .filter((d): d is Depot => d !== null)
    .sort((a, b) => Date.parse(b.actifLe) - Date.parse(a.actifLe));
}

// Liste automatique : ni fork, ni archive, ni dépôt exclu, ni dépôt déjà mis en avant.
export function depotsAutomatiques(
  depots: Depot[],
  options: { exclus: string[]; misEnAvant: string[] },
): Depot[] {
  const ecartes = new Set([...options.exclus, ...options.misEnAvant]);
  return depots.filter((d) => !d.fork && !d.archive && !ecartes.has(d.depot));
}

export async function recupererDepots(
  fetchFn: typeof fetch,
  jeton?: string,
  delaiMs = 10_000,
): Promise<Depot[]> {
  const entetes: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "nclsmgr.com-build",
  };
  if (jeton) entetes.Authorization = `Bearer ${jeton}`;
  const reponse = await fetchFn(API, { headers: entetes, signal: AbortSignal.timeout(delaiMs) });
  if (!reponse.ok) throw new Error(`API GitHub : HTTP ${reponse.status}`);
  return lireReponse(await reponse.json());
}

export type Resultat = { instantane: Instantane; source: "api" | "repli" };

// En cas d'échec, l'instantané précédent est conservé ; en mode strict (build planifié),
// l'échec est remonté pour que la version en ligne reste en place.
export async function actualiserInstantane(options: {
  recuperer: () => Promise<Depot[]>;
  precedent: Instantane | null;
  strict: boolean;
  maintenant?: () => Date;
}): Promise<Resultat> {
  try {
    const depots = await options.recuperer();
    const genereLe = (options.maintenant?.() ?? new Date()).toISOString();
    return { instantane: { genereLe, depots }, source: "api" };
  } catch (erreur) {
    if (options.strict || !options.precedent) throw erreur;
    return { instantane: options.precedent, source: "repli" };
  }
}

export function lireInstantane(json: unknown): Instantane | null {
  if (typeof json !== "object" || json === null) return null;
  const r = json as Brut;
  if (typeof r.genereLe !== "string" || !Array.isArray(r.depots)) return null;
  const depots = r.depots.filter(
    (d): d is Depot =>
      typeof d === "object" &&
      d !== null &&
      typeof (d as Brut).depot === "string" &&
      typeof (d as Brut).url === "string" &&
      String((d as Brut).url).startsWith(PREFIXE_DEPOT),
  );
  return { genereLe: r.genereLe, depots };
}
