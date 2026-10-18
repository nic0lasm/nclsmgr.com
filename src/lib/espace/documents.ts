import "server-only";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { locales, type Locale } from "@/lib/i18n";
import { FORMAT_DOCUMENT } from "./liens";

// Documents réservés de l'espace privé (CV complet en PDF). Ni les fichiers ni leur catalogue
// ne sont dans le dépôt : ils vivent sur le volume « prive », dans le dossier documents/.
// Le catalogue associe un identifiant (celui que porte le lien) à un titre et à un fichier par
// langue. Le chemin lu sur le disque ne vient que du catalogue validé, jamais de l'URL.

export type EntreeCatalogue = {
  titre: Partial<Record<Locale, string>>;
  fichiers: Partial<Record<Locale, string>>;
  noms: Partial<Record<Locale, string>>;
};

/** Identifiant de document vers son entrée. Une Map : aucune clé héritée d'Object. */
export type Catalogue = Map<string, EntreeCatalogue>;

export type DocumentAffiche = { id: string; titre: string; langue: Locale };
export type DocumentLu = { contenu: Uint8Array<ArrayBuffer>; nom: string };

const TAILLE_MAX_CATALOGUE = 16 * 1024;
export const TAILLE_MAX_DOCUMENT = 10 * 1024 * 1024;
const MAX_ENTREES = 50;
const LIMITE_TITRE = 80;
// Nom du fichier sur le volume : minuscules, sans barre oblique, extension .pdf.
const FICHIER = /^[a-z0-9][a-z0-9._-]{0,80}\.pdf$/;
// Nom proposé au téléchargement : ASCII simple, majuscules permises, pour Content-Disposition.
const NOM = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.pdf$/;
// Mêmes caractères refusés que pour les liens : contrôle, format, demi-paires, séparateurs.
const INTERDIT = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
// Tout PDF commence par cette signature : un autre contenu nommé .pdf n'est jamais servi.
const SIGNATURE_PDF = Buffer.from("%PDF-", "latin1");
/**
 * Noms PDF d'actions ou de contenu actif : scripts, action à l'ouverture, actions
 * automatiques, lancement d'application, fichiers joints. Sous Chromium, la visionneuse PDF
 * remplace la réponse par sa propre page, où la politique de sécurité du document ne
 * s'applique pas : le JavaScript d'un PDF y est exécuté. Un PDF qui porte l'un de ces noms
 * n'est donc pas servi.
 */
const NOMS_ACTIFS = new Set([
  "JavaScript",
  "JS",
  "OpenAction",
  "AA",
  "Launch",
  "EmbeddedFile",
  "EmbeddedFiles",
]);
/**
 * Nom PDF : « / » puis lettres ou séquences #xx (/J#61vaScript vaut /JavaScript), terminé par
 * un blanc, un délimiteur PDF ou la fin du fichier. Un préfixe de police comme /AAAAAA+Helvetica
 * ne correspond donc pas à /AA.
 */
const NOM_PDF = /\/((?:[A-Za-z]|#[0-9A-Fa-f]{2})+)(?=[\0\t\n\f\r ()<>[\]{}/%]|$)/g;

/**
 * Vrai si le fichier nomme une action ou un contenu actif en clair. Les objets rangés dans des
 * flux compressés (object streams, PDF 1.5 et suivants) échappent à cette recherche : c'est
 * une barrière contre une erreur de génération ou de dépôt, pas une garantie. La protection
 * tient d'abord à des PDF de confiance, produits par l'administrateur.
 */
export function contenuActif(contenu: Uint8Array): boolean {
  const texte = Buffer.from(contenu.buffer, contenu.byteOffset, contenu.byteLength).toString(
    "latin1",
  );
  for (const [, nom] of texte.matchAll(NOM_PDF)) {
    const decode = nom.includes("#")
      ? nom.replace(/#([0-9A-Fa-f]{2})/g, (_, hexa: string) =>
          String.fromCharCode(Number.parseInt(hexa, 16)),
        )
      : nom;
    if (NOMS_ACTIFS.has(decode)) return true;
  }
  return false;
}

/** Erreur de validation : ne porte que le chemin du champ, jamais sa valeur. */
export class CatalogueInvalide extends Error {}

type Objet = Record<string, unknown>;

function objet(valeur: unknown, champ: string, cles: readonly string[]): Objet {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
    throw new CatalogueInvalide(champ);
  }
  if (Object.keys(valeur).some((cle) => !cles.includes(cle))) {
    throw new CatalogueInvalide(`${champ}, clé inconnue`);
  }
  return valeur as Objet;
}

/** Un texte par langue, au moins une langue, chaque valeur vérifiée par `valide`. */
function parLangue(
  valeur: unknown,
  champ: string,
  valide: (texte: string) => string | null,
  obligatoire: boolean,
): Partial<Record<Locale, string>> {
  if (valeur === undefined && !obligatoire) return {};
  const brut = objet(valeur, champ, locales);
  const resultat: Partial<Record<Locale, string>> = {};
  for (const langue of locales) {
    if (brut[langue] === undefined) continue;
    const texte = typeof brut[langue] === "string" ? valide(brut[langue]) : null;
    if (texte === null) throw new CatalogueInvalide(`${champ}.${langue}`);
    resultat[langue] = texte;
  }
  if (Object.keys(resultat).length === 0) throw new CatalogueInvalide(champ);
  return resultat;
}

function titre(texte: string): string | null {
  const propre = texte.normalize("NFC").trim();
  return propre && propre.length <= LIMITE_TITRE && !INTERDIT.test(propre) ? propre : null;
}

const motif = (format: RegExp) => (texte: string) => (format.test(texte) ? texte : null);

/**
 * Valide strictement le catalogue : identifiant au format des liens, clés connues, titres
 * courts sans caractère invisible, noms de fichiers simples. Toute erreur rend tout le fichier
 * invalide.
 */
export function validerCatalogue(json: unknown): Catalogue {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new CatalogueInvalide("racine");
  }
  const entrees = Object.entries(json);
  if (entrees.length > MAX_ENTREES) throw new CatalogueInvalide("racine, trop d'entrées");
  const catalogue: Catalogue = new Map();
  entrees.forEach(([id, valeur], i) => {
    // Un identifiant mal formé n'est pas repris : une faute de saisie pourrait y mettre autre chose.
    if (!FORMAT_DOCUMENT.test(id)) throw new CatalogueInvalide(`entrée ${i + 1}, identifiant`);
    const brut = objet(valeur, id, ["titre", "fichiers", "noms"]);
    catalogue.set(id, {
      titre: parLangue(brut.titre, `${id}.titre`, titre, true),
      fichiers: parLangue(brut.fichiers, `${id}.fichiers`, motif(FICHIER), true),
      noms: parLangue(brut.noms, `${id}.noms`, motif(NOM), false),
    });
  });
  return catalogue;
}

export function dossierDocuments(): string {
  return join(process.env.ESPACE_PRIVE || "/data/prive", "documents");
}

function avertir(raison: string) {
  // Jamais le contenu du fichier : seulement la raison, ou le chemin du champ refusé.
  console.error(`Espace privé : catalogue des documents ignoré (${raison}), aucun document.`);
}

type Lecture =
  { contenu: Uint8Array<ArrayBuffer> } | { refus: "absent" | "type" | "taille" | "lecture" };

/**
 * Ouvre un fichier du dossier documents une seule fois, sans suivre de lien symbolique, puis
 * vérifie et lit sur le même descripteur : le fichier ne peut pas être remplacé entre les deux.
 * La lecture est bornée, même si le fichier grandit entre-temps.
 */
async function lireFichier(nom: string, tailleMax: number): Promise<Lecture> {
  let fichier: FileHandle;
  try {
    // Non bloquant : un tube nommé à la place du fichier ne fige pas la requête.
    fichier = await open(
      join(dossierDocuments(), nom),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (erreur) {
    const code = (erreur as { code?: string }).code;
    // ELOOP : le nom désigne un lien symbolique, refusé par O_NOFOLLOW.
    return { refus: code === "ENOENT" ? "absent" : code === "ELOOP" ? "type" : "lecture" };
  }
  try {
    const infos = await fichier.stat();
    if (!infos.isFile()) return { refus: "type" };
    if (infos.size > tailleMax) return { refus: "taille" };
    const tampon = Buffer.alloc(Math.min(infos.size, tailleMax) + 1);
    let lus = 0;
    while (lus < tampon.length) {
      const { bytesRead } = await fichier.read(tampon, lus, tampon.length - lus, lus);
      if (bytesRead === 0) break;
      lus += bytesRead;
    }
    // Un octet de plus que la taille annoncée : le fichier a grandi depuis le fstat.
    if (lus > tailleMax || lus > infos.size) return { refus: "taille" };
    return { contenu: tampon.subarray(0, lus) };
  } catch {
    return { refus: "lecture" };
  } finally {
    await fichier.close().catch(() => {});
  }
}

/**
 * Catalogue relu à chaque appel, pour qu'un dépôt de fichier soit pris en compte sans
 * redémarrage. Ne lève jamais : absent ou invalide, il est vide.
 */
export async function lireCatalogue(): Promise<Catalogue> {
  const lecture = await lireFichier("catalogue.json", TAILLE_MAX_CATALOGUE);
  if ("refus" in lecture) {
    if (lecture.refus !== "absent") {
      avertir(
        lecture.refus === "lecture"
          ? "lecture impossible"
          : "fichier trop grand ou de type inattendu",
      );
    }
    return new Map();
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(lecture.contenu));
  } catch {
    // Le message de JSON.parse peut citer un extrait du fichier : il n'est pas repris.
    avertir("JSON illisible");
    return new Map();
  }
  try {
    return validerCatalogue(json);
  } catch (erreur) {
    avertir(erreur instanceof CatalogueInvalide ? `champ ${erreur.message} invalide` : "invalide");
    return new Map();
  }
}

/** Valeur dans la langue demandée, sinon dans la première langue disponible. */
function choisir(
  valeurs: Partial<Record<Locale, string>>,
  langue: Locale,
): { valeur: string; langue: Locale } | null {
  for (const l of [langue, ...locales.filter((autre) => autre !== langue)]) {
    const valeur = valeurs[l];
    if (valeur !== undefined) return { valeur, langue: l };
  }
  return null;
}

/** Documents du lien présents au catalogue, dans l'ordre du lien, titrés dans la langue demandée. */
export function documentsAffiches(
  catalogue: Catalogue,
  autorises: readonly string[],
  langue: Locale,
): DocumentAffiche[] {
  return autorises.flatMap((id) => {
    const entree = catalogue.get(id);
    const choix = entree ? choisir(entree.titre, langue) : null;
    return choix ? [{ id, titre: choix.valeur, langue: choix.langue }] : [];
  });
}

/**
 * Lit un document pour un lien. Rend null, sans distinguer les cas, quand l'identifiant n'est
 * pas dans le lien, manque au catalogue, ou que le fichier est absent, trop grand, n'est pas un
 * fichier régulier, n'est pas un PDF ou contient du JavaScript ou une action.
 */
export async function lireDocument(
  id: string,
  langue: Locale,
  autorises: readonly string[],
): Promise<DocumentLu | null> {
  if (!FORMAT_DOCUMENT.test(id) || !autorises.includes(id)) return null;
  const entree = (await lireCatalogue()).get(id);
  const fichier = entree ? choisir(entree.fichiers, langue) : null;
  if (!entree || !fichier) return null;
  // Les messages citent l'identifiant, déjà validé par FORMAT_DOCUMENT, jamais le nom du
  // fichier ni son contenu.
  const lecture = await lireFichier(fichier.valeur, TAILLE_MAX_DOCUMENT);
  if ("refus" in lecture) {
    console.error(
      lecture.refus === "absent"
        ? `Espace privé : document ${id} absent du volume.`
        : `Espace privé : document ${id} illisible ou refusé.`,
    );
    return null;
  }
  if (!SIGNATURE_PDF.equals(lecture.contenu.subarray(0, SIGNATURE_PDF.length))) {
    console.error(`Espace privé : document ${id} refusé, ce n'est pas un PDF.`);
    return null;
  }
  if (contenuActif(lecture.contenu)) {
    console.error(`Espace privé : document ${id} refusé, il contient du JavaScript ou une action.`);
    return null;
  }
  const nom = entree.noms[fichier.langue] ?? choisir(entree.noms, langue)?.valeur ?? fichier.valeur;
  return { contenu: lecture.contenu, nom };
}
