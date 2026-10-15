import type { Fiche } from "@/lib/projets";
import type { Profil } from "./liens";

// Contenu de l'espace selon le profil du lien, dans l'ordre d'affichage. Le message nominatif
// est commun à tous les profils.
export type Bloc = "parcours" | "references" | "contributions" | "etudes" | "coordonnees";

export const blocsParProfil: Record<Profil, readonly Bloc[]> = {
  recruteur: ["parcours", "references", "coordonnees"],
  developpeur: ["contributions"],
  client: ["etudes", "coordonnees"],
  partenaire: ["etudes", "coordonnees"],
};

/** Découpe un texte libre en paragraphes, un par ligne non vide. Aucun balisage interprété. */
export function paragraphes(texte: string | null): string[] {
  if (!texte) return [];
  return texte
    .split(/\r\n?|\n/)
    .map((ligne) => ligne.trim())
    .filter(Boolean);
}

type FicheProjet = Pick<Fiche, "id" | "titre" | "contribuer" | "liens">;
export type DocumentProjet = { projet: string; libelle: string; url: string };

function nomFichier(url: string): string {
  try {
    return new URL(url).pathname.split("/").pop()?.toLowerCase() ?? "";
  } catch {
    return "";
  }
}

/**
 * Projets à montrer à un développeur : ceux dont la fiche dit comment contribuer, ou à défaut
 * tous les projets mis en avant. Feuilles de route et guides de contribution sont repérés
 * parmi les liens des fiches par leur nom de fichier (ROADMAP.md, CONTRIBUTING.md).
 */
export function projetsPourContributeurs<F extends FicheProjet>(fiches: F[]) {
  const ouverts = fiches.filter((f) => f.contribuer);
  const documents = (nom: string): DocumentProjet[] =>
    fiches.flatMap((f) =>
      f.liens
        .filter((l) => nomFichier(l.url) === nom)
        .map((l) => ({ projet: f.titre, libelle: l.libelle, url: l.url })),
    );
  return {
    ouverts: ouverts.length > 0,
    projets: ouverts.length > 0 ? ouverts : fiches,
    feuillesDeRoute: documents("roadmap.md"),
    guides: documents("contributing.md"),
  };
}
