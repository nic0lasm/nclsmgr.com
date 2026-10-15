// Forme des contenus de src/content/{fr,en}. Les deux langues partagent la même structure.

export type Statut = "a-rediger" | "brouillon" | "valide";

/** Mois au format AAAA-MM. */
export type Mois = string;

interface Fichier {
  statut: Statut;
  langue: "fr" | "en";
}

export interface Profil extends Fichier {
  nom: string;
  intitule: string;
  localisation: string;
  accroche: string;
  resume: string[];
  chiffres_cles: { valeur: string; libelle: string }[];
  langues: { langue: string; niveau: string; cecrl: string | null }[];
  centres_interet: { libelle: string; detail: string | null }[];
  liens: { type: "linkedin" | "github" | "site"; url: string }[];
}

export interface Experience {
  id: string;
  poste: string;
  organisation: string;
  secteur: string | null;
  lieu: string | null;
  debut: Mois;
  fin: Mois | null;
  contexte: string | null;
  realisations: string[];
  outils: string[];
}

export interface Formation {
  id: string;
  diplome: string;
  etablissement: string;
  lieu: string | null;
  debut: Mois | null;
  fin: Mois;
  detail: string | null;
}

export interface Certification {
  id: string;
  nom: string;
  organisme: string;
  obtention: Mois;
  expiration: Mois | null;
  identifiant: string | null;
  url_verification: string | null;
}

export interface Parcours extends Fichier {
  experiences: Experience[];
  formations: Formation[];
  certifications: Certification[];
}

export interface Competences extends Fichier {
  domaines: { id: string; libelle: string; elements: string[] }[];
}

export interface EtudeDeCas {
  id: string;
  titre: string;
  organisation: string;
  debut: Mois;
  fin: Mois | null;
  contexte: string;
  role: string;
  enjeux: string[];
  actions: string[];
  resultats: string[];
  note: string | null;
  liens: { libelle: string; url: string }[];
}

export interface Portfolio extends Fichier {
  intro: string;
  etudes: EtudeDeCas[];
  autres: { titre: string; texte: string; lien: { libelle: string; chemin: string } };
}

export const pagesSeo = [
  "accueil",
  "cv",
  "dev",
  "portfolio",
  "contact",
  "mentions_legales",
  "confidentialite",
] as const;
export type PageSeo = (typeof pagesSeo)[number];

export interface Seo extends Fichier {
  site: { nom: string; url: string; locale: string; auteur: string };
  pages: Record<PageSeo, { titre: string; description: string; og_image: string | null }>;
}

export interface Interface {
  langue: "fr" | "en";
  accueil: {
    profil: string;
    parcours: string;
    voirCv: string;
    meContacter: string;
    chiffresCles: string;
  };
  portfolio: {
    titre: string;
    etudes: string;
    contexte: string;
    role: string;
    enjeux: string;
    actions: string;
    resultats: string;
  };
  cv: {
    titre: string;
    experiences: string;
    formations: string;
    certifications: string;
    competences: string;
    langues: string;
    centresInteret: string;
    enCours: string;
    realisations: string;
  };
  contact: {
    linkedin: string;
    formulaire: {
      nom: string;
      email: string;
      emailAide: string;
      objet: string;
      objets: string[];
      message: string;
      envoyer: string;
      mention: string;
      piege: string;
      succes: string;
      champManquant: string;
      emailInvalide: string;
      trop: string;
      echec: string;
      tropDEnvois: string;
    };
  };
}
