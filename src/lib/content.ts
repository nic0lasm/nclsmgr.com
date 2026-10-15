import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Competences, Interface, Parcours, Portfolio, Profil, Seo } from "@/content/types";
import enCompetences from "@/content/en/competences.json";
import enInterface from "@/content/en/interface.json";
import enParcours from "@/content/en/parcours.json";
import enPortfolio from "@/content/en/portfolio.json";
import enProfil from "@/content/en/profil.json";
import enSeo from "@/content/en/seo.json";
import frCompetences from "@/content/fr/competences.json";
import frInterface from "@/content/fr/interface.json";
import frParcours from "@/content/fr/parcours.json";
import frPortfolio from "@/content/fr/portfolio.json";
import frProfil from "@/content/fr/profil.json";
import frSeo from "@/content/fr/seo.json";
import type { Locale } from "@/lib/i18n";
import { parseMarkdown, type Document } from "@/lib/markdown";

export interface Contenu {
  profil: Profil;
  parcours: Parcours;
  portfolio: Portfolio;
  competences: Competences;
  seo: Seo;
  ui: Interface;
}

// Les JSON importés sont typés largement par TypeScript : leur forme exacte est vérifiée par content.test.ts.
const fr: Contenu = {
  profil: frProfil as Profil,
  parcours: frParcours as Parcours,
  portfolio: frPortfolio as Portfolio,
  competences: frCompetences as Competences,
  seo: frSeo as Seo,
  ui: frInterface as Interface,
};
const en: Contenu = {
  profil: enProfil as Profil,
  parcours: enParcours as Parcours,
  portfolio: enPortfolio as Portfolio,
  competences: enCompetences as Competences,
  seo: enSeo as Seo,
  ui: enInterface as Interface,
};

const contenus: Record<Locale, Contenu> = { fr, en };

export function getContent(locale: Locale): Contenu {
  return contenus[locale];
}

export const pagesTexte = ["contact", "mentions-legales", "confidentialite"] as const;
export type PageTexte = (typeof pagesTexte)[number];

const contentDir = path.join(process.cwd(), "src", "content");

export async function getPage(locale: Locale, page: PageTexte): Promise<Document> {
  const source = await readFile(path.join(contentDir, locale, "pages", `${page}.md`), "utf8");
  return parseMarkdown(source);
}
