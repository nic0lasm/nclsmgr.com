import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pagesSeo } from "@/content/types";
import { getContent, getPage, pagesTexte } from "./content";

const fr = getContent("fr");
const en = getContent("en");
const contentDir = path.join(process.cwd(), "src", "content");

// Remplace chaque valeur par son type pour comparer la forme de deux objets.
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "langue")
        .map(([key, v]) => [key, shape(v)]),
    );
  }
  return value === null ? null : typeof value;
}

function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

const markdown = readdirSync(contentDir, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".md"))
  .map((file) => readFileSync(path.join(contentDir, file), "utf8"));
const everything = [...allStrings(fr), ...allStrings(en), ...markdown];

describe("contenus", () => {
  it("ont la même structure en français et en anglais", () => {
    expect(shape(en)).toEqual(shape(fr));
  });

  it("garde les identifiants, dates et liens identiques entre les langues", () => {
    const keys = (c: typeof fr) => ({
      experiences: c.parcours.experiences.map((e) => [e.id, e.debut, e.fin]),
      formations: c.parcours.formations.map((f) => [f.id, f.debut, f.fin]),
      certifications: c.parcours.certifications.map((x) => [x.id, x.obtention]),
      domaines: c.competences.domaines.map((d) => d.id),
      liens: c.profil.liens,
      etudes: c.portfolio.etudes.map((e) => [e.id, e.debut, e.fin, e.liens.map((l) => l.url)]),
      autres: c.portfolio.autres.lien.chemin,
      referentiels: c.accueil.referentiels.elements.map((r) => [r.id, r.niveau]),
      code: c.accueil.code.liens.map((l) => l.url),
    });
    expect(keys(en)).toEqual(keys(fr));
  });

  it("ne contient ni texte à confirmer ni variable non remplie", () => {
    for (const text of everything) {
      expect(text).not.toMatch(/à confirmer|to be confirmed|\{\{|\}\}|TODO/i);
    }
  });

  it("ne publie aucune coordonnée personnelle", () => {
    for (const text of everything) {
      // Seul le numéro de l'hébergeur, exigé par la LCEN, est autorisé.
      expect(text.replaceAll("+33 9 72 10 10 07", "")).not.toMatch(
        /(?:\+33|\b0)[1-9](?:[\s.-]?\d{2}){4}/,
      );
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(text).not.toMatch(/skype/i);
    }
  });

  it("n'utilise pas de tiret cadratin", () => {
    for (const text of everything) expect(text).not.toContain("—");
  });

  it("utilise des dates au format AAAA-MM", () => {
    for (const c of [fr, en]) {
      const dates = [
        ...c.parcours.experiences.flatMap((e) => [e.debut, e.fin]),
        ...c.parcours.formations.flatMap((f) => [f.debut, f.fin]),
        ...c.parcours.certifications.flatMap((x) => [x.obtention, x.expiration]),
        ...c.portfolio.etudes.flatMap((e) => [e.debut, e.fin]),
      ].filter((d): d is string => d !== null);
      for (const d of dates) expect(d).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    }
  });

  it("respecte les types attendus pour les liens et statuts", () => {
    for (const c of [fr, en]) {
      for (const lien of c.profil.liens) {
        expect(["linkedin", "github", "site"]).toContain(lien.type);
        expect(lien.url).toMatch(/^https:\/\//);
      }
      for (const lien of c.portfolio.etudes.flatMap((e) => e.liens)) {
        expect(lien.url).toMatch(/^https:\/\//);
      }
      expect(c.portfolio.autres.lien.chemin).toMatch(/^\/[a-z-]+$/);
      for (const lien of c.accueil.code.liens) {
        expect(lien.url).toMatch(/^https:\/\/github\.com\/nic0lasm\/nclsmgr\.com(?:\/|$)/);
      }
      for (const r of c.accueil.referentiels.elements) {
        expect(Object.keys(c.accueil.referentiels.niveaux)).toContain(r.niveau);
      }
      for (const fichier of [c.accueil, c.profil, c.parcours, c.portfolio, c.competences, c.seo]) {
        expect(["a-rediger", "brouillon", "valide"]).toContain(fichier.statut);
      }
    }
  });

  it("ne référence que des images Open Graph présentes dans public/", () => {
    for (const c of [fr, en]) {
      for (const page of pagesSeo) {
        const image = c.seo.pages[page].og_image;
        if (image) expect(existsSync(path.join(process.cwd(), "public", image))).toBe(true);
      }
    }
  });

  it("fournit un titre et une description SEO de bonne longueur pour chaque page", () => {
    for (const c of [fr, en]) {
      for (const page of pagesSeo) {
        const { titre, description } = c.seo.pages[page];
        expect(titre.length, `${c.seo.langue} ${page}`).toBeGreaterThan(0);
        expect(titre.length, `${c.seo.langue} ${page}`).toBeLessThanOrEqual(60);
        expect(description.length, `${c.seo.langue} ${page}`).toBeGreaterThanOrEqual(50);
        expect(description.length, `${c.seo.langue} ${page}`).toBeLessThanOrEqual(160);
      }
    }
  });

  it("fournit chaque page de texte dans les deux langues, avec un titre", async () => {
    for (const lang of ["fr", "en"] as const) {
      for (const page of pagesTexte) {
        const doc = await getPage(lang, page);
        expect(doc.frontmatter.titre, `${lang} ${page}`).toBeTruthy();
        expect(doc.blocks.length, `${lang} ${page}`).toBeGreaterThan(0);
      }
    }
  });
});
