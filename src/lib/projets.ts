import type { StaticImageData } from "next/image";
import depotsGithub from "@/content/projets/depots-github.json";
import exclus from "@/content/projets/exclus.json";
import projetsEn from "@/content/projets/en.json";
import projetsFr from "@/content/projets/fr.json";
import imageFrontfall from "@/content/projets/images/frontfall.jpg";
import imageZeus from "@/content/projets/images/zeus-poseidon.jpg";
import { depotsAutomatiques, lireInstantane, type Depot } from "@/lib/github";
import type { Locale } from "@/lib/i18n";

export type Fiche = {
  id: string;
  depot: string | null;
  ordre: number;
  afficher: boolean;
  titre: string;
  pitch: string;
  probleme: string;
  stack: string[];
  role: string;
  points_forts: string[];
  chiffres?: { valeur: string; libelle: string }[];
  image?: { src: string; alt: string } | null;
  contribuer?: string | null;
  liens: { libelle: string; url: string }[];
};

type FichierProjets = { statut: string; maj: string; projets: Fiche[] };

const fichiers: Record<Locale, FichierProjets> = { fr: projetsFr, en: projetsEn };

// Les images passent par l'import statique : elles sont servies depuis /_next/static,
// avec une empreinte dans le nom et un cache long.
const images: Record<string, StaticImageData> = {
  frontfall: imageFrontfall,
  "zeus-poseidon": imageZeus,
};

export type FicheAffichee = Fiche & { github: Depot | null; visuel: StaticImageData | null };

export function fichesMisesEnAvant(lang: Locale, depots: Depot[]): FicheAffichee[] {
  const parDepot = new Map(depots.map((d) => [d.depot, d]));
  return fichiers[lang].projets
    .filter((f) => f.afficher)
    .sort((a, b) => a.ordre - b.ordre)
    .map((f) => ({
      ...f,
      github: f.depot ? (parDepot.get(f.depot) ?? null) : null,
      visuel: f.image ? (images[f.id] ?? null) : null,
    }));
}

export function donneesOngletDev(lang: Locale) {
  const instantane = lireInstantane(depotsGithub) ?? { genereLe: "", depots: [] };
  const fiches = fichesMisesEnAvant(lang, instantane.depots);
  const autres = depotsAutomatiques(instantane.depots, {
    exclus: exclus.exclus,
    misEnAvant: fiches.flatMap((f) => (f.depot ? [f.depot] : [])),
  });
  return { fiches, autres, genereLe: instantane.genereLe };
}
