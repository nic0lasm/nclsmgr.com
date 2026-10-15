import { describe, expect, it } from "vitest";
import { locales } from "@/lib/i18n";
import { articleExists, getArticle, getArticles } from "./articles";

describe("articles", () => {
  it("ont un titre, une description et une date valides dans chaque langue", async () => {
    for (const lang of locales) {
      for (const a of await getArticles(lang)) {
        const id = `${lang}/${a.slug}`;
        expect(a.titre.length, id).toBeLessThanOrEqual(60);
        expect(a.description.length, id).toBeGreaterThanOrEqual(50);
        expect(a.description.length, id).toBeLessThanOrEqual(160);
        expect(Number.isNaN(Date.parse(a.date)), id).toBe(false);
        expect(a.langues, id).toContain(lang);
        expect(a.doc.blocks.length, id).toBeGreaterThan(0);
      }
    }
  });

  it("sont triés du plus récent au plus ancien", async () => {
    for (const lang of locales) {
      const dates = (await getArticles(lang)).map((a) => a.date);
      expect(dates).toEqual([...dates].sort().reverse());
    }
  });

  it("refusent un slug qui n'est pas un nom de fichier d'article", async () => {
    for (const slug of ["../pages/contact", "..", "Contact", "a/b", "", "a--b"]) {
      expect(await getArticle("fr", slug)).toBeNull();
      expect(await articleExists(slug)).toBe(false);
    }
  });
});
