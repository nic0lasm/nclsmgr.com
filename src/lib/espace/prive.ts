import "server-only";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { locales, type Locale } from "@/lib/i18n";

// Données personnelles de l'espace privé (coordonnées, références). Elles ne sont jamais dans
// le dépôt : le fichier prive.json vit sur le volume « prive » du serveur. S'il manque ou s'il
// est invalide, les blocs correspondants sont masqués, et le journal ne cite jamais son contenu.

export type Coordonnees = {
  telephone: string | null;
  email: string | null;
  ville: string | null;
  linkedin: string | null;
};

export type Reference = {
  nom: string;
  role: string | null;
  organisation: string | null;
  texte: string | null;
  contact: string | null;
};

export type DonneesPrivees = { coordonnees: Coordonnees | null; references: Reference[] };
export type FichierPrive = Partial<Record<Locale, DonneesPrivees>>;

const TAILLE_MAX = 64 * 1024;
const MAX_REFERENCES = 10;
const LIMITES = {
  ville: 80,
  nom: 120,
  role: 120,
  organisation: 120,
  texte: 1000,
  contact: 200,
} as const;
const TELEPHONE = /^\+?[0-9](?:[0-9 .-]{4,22})[0-9]$/;
const EMAIL = /^[^\s@<>"(),;:]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
// Mêmes caractères refusés que pour les liens : contrôle, format, demi-paires, séparateurs.
const INTERDIT = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

export const vide = (): DonneesPrivees => ({ coordonnees: null, references: [] });

/** Erreur de validation : ne porte que le chemin du champ, jamais sa valeur. */
export class PriveInvalide extends Error {}

type Objet = Record<string, unknown>;

function objet(valeur: unknown, champ: string, cles: readonly string[]): Objet {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
    throw new PriveInvalide(champ);
  }
  // Le nom d'une clé inconnue n'est pas repris : une faute de saisie pourrait y mettre une valeur.
  if (Object.keys(valeur).some((cle) => !cles.includes(cle))) {
    throw new PriveInvalide(`${champ}, clé inconnue`);
  }
  return valeur as Objet;
}

function texte(
  valeur: unknown,
  champ: string,
  limite: number,
  options: { obligatoire?: boolean; lignes?: boolean } = {},
): string | null {
  if (valeur === undefined || valeur === null) {
    if (options.obligatoire) throw new PriveInvalide(champ);
    return null;
  }
  if (typeof valeur !== "string") throw new PriveInvalide(champ);
  let propre = valeur.normalize("NFC").trim();
  if (options.lignes) propre = propre.replace(/\r\n?/g, "\n");
  if (!propre) {
    if (options.obligatoire) throw new PriveInvalide(champ);
    return null;
  }
  const controle = options.lignes ? propre.replaceAll("\n", "") : propre;
  if (propre.length > limite || INTERDIT.test(controle)) throw new PriveInvalide(champ);
  return propre;
}

function telephone(valeur: unknown, champ: string): string | null {
  const propre = texte(valeur, champ, 30);
  if (propre !== null && !TELEPHONE.test(propre)) throw new PriveInvalide(champ);
  return propre;
}

function email(valeur: unknown, champ: string): string | null {
  const propre = texte(valeur, champ, 254);
  if (propre !== null && !EMAIL.test(propre)) throw new PriveInvalide(champ);
  return propre;
}

function linkedin(valeur: unknown, champ: string): string | null {
  const propre = texte(valeur, champ, 200);
  if (propre === null) return null;
  let url: URL;
  try {
    url = new URL(propre);
  } catch {
    throw new PriveInvalide(champ);
  }
  const hote = url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com");
  if (url.protocol !== "https:" || !hote || url.username || url.password || url.port) {
    throw new PriveInvalide(champ);
  }
  return url.toString();
}

function coordonnees(valeur: unknown, champ: string): Coordonnees | null {
  if (valeur === undefined || valeur === null) return null;
  const brut = objet(valeur, champ, ["telephone", "email", "ville", "linkedin"]);
  const resultat: Coordonnees = {
    telephone: telephone(brut.telephone, `${champ}.telephone`),
    email: email(brut.email, `${champ}.email`),
    ville: texte(brut.ville, `${champ}.ville`, LIMITES.ville),
    linkedin: linkedin(brut.linkedin, `${champ}.linkedin`),
  };
  return Object.values(resultat).some((v) => v !== null) ? resultat : null;
}

function reference(valeur: unknown, champ: string): Reference {
  const brut = objet(valeur, champ, ["nom", "role", "organisation", "texte", "contact"]);
  return {
    nom: texte(brut.nom, `${champ}.nom`, LIMITES.nom, { obligatoire: true }) as string,
    role: texte(brut.role, `${champ}.role`, LIMITES.role),
    organisation: texte(brut.organisation, `${champ}.organisation`, LIMITES.organisation),
    texte: texte(brut.texte, `${champ}.texte`, LIMITES.texte, { lignes: true }),
    contact: texte(brut.contact, `${champ}.contact`, LIMITES.contact),
  };
}

function references(valeur: unknown, champ: string): Reference[] {
  if (valeur === undefined || valeur === null) return [];
  if (!Array.isArray(valeur) || valeur.length > MAX_REFERENCES) throw new PriveInvalide(champ);
  return valeur.map((r, i) => reference(r, `${champ}[${i}]`));
}

/**
 * Valide strictement le contenu de prive.json : clés inconnues, types inattendus, textes trop
 * longs ou caractères invisibles rendent tout le fichier invalide.
 */
export function validerPrive(json: unknown): FichierPrive {
  const racine = objet(json, "racine", locales);
  const fichier: FichierPrive = {};
  for (const langue of locales) {
    if (racine[langue] === undefined) continue;
    const brut = objet(racine[langue], langue, ["coordonnees", "references"]);
    fichier[langue] = {
      coordonnees: coordonnees(brut.coordonnees, `${langue}.coordonnees`),
      references: references(brut.references, `${langue}.references`),
    };
  }
  return fichier;
}

/** Une adresse de contact reconnue comme e-mail ou téléphone devient un lien, sinon du texte. */
export function typeContact(contact: string): "email" | "telephone" | "texte" {
  if (EMAIL.test(contact)) return "email";
  if (TELEPHONE.test(contact)) return "telephone";
  return "texte";
}

export function cheminPrive(): string {
  return join(process.env.ESPACE_PRIVE || "/data/prive", "prive.json");
}

function avertir(raison: string) {
  // Jamais le contenu du fichier : seulement la raison, ou le chemin du champ refusé.
  console.error(`Espace privé : prive.json ignoré (${raison}), blocs privés masqués.`);
}

/**
 * Données privées de la langue demandée, relues à chaque appel pour qu'une mise à jour du
 * fichier soit prise en compte sans redémarrage. Ne lève jamais.
 */
export async function lirePrive(langue: Locale): Promise<DonneesPrivees> {
  let fichier: FileHandle;
  try {
    // Non bloquant : un tube nommé à la place du fichier ne fige pas la page.
    fichier = await open(cheminPrive(), constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (erreur) {
    if ((erreur as { code?: string }).code !== "ENOENT") avertir("lecture impossible");
    return vide();
  }
  let source: string;
  try {
    // Vérification et lecture sur le même descripteur : le fichier ne peut pas être remplacé
    // entre les deux. La lecture est bornée, même si le fichier grandit entre-temps.
    const infos = await fichier.stat();
    if (!infos.isFile() || infos.size > TAILLE_MAX) {
      avertir("fichier trop grand ou de type inattendu");
      return vide();
    }
    const tampon = Buffer.alloc(TAILLE_MAX + 1);
    const { bytesRead } = await fichier.read(tampon, 0, tampon.length, 0);
    if (bytesRead > TAILLE_MAX) {
      avertir("fichier trop grand ou de type inattendu");
      return vide();
    }
    source = tampon.toString("utf8", 0, bytesRead);
  } catch {
    avertir("lecture impossible");
    return vide();
  } finally {
    await fichier.close().catch(() => {});
  }
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    // Le message de JSON.parse peut citer un extrait du fichier : il n'est pas repris.
    avertir("JSON illisible");
    return vide();
  }
  try {
    return validerPrive(json)[langue] ?? vide();
  } catch (erreur) {
    avertir(erreur instanceof PriveInvalide ? `champ ${erreur.message} invalide` : "invalide");
    return vide();
  }
}
