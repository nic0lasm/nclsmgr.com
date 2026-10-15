import { describe, expect, it } from "vitest";
import { profils } from "./liens";
import { blocsParProfil, paragraphes, projetsPourContributeurs } from "./profils";

describe("blocsParProfil", () => {
  it("donne à chaque profil son contenu", () => {
    expect(Object.keys(blocsParProfil).sort()).toEqual([...profils].sort());
    expect(blocsParProfil.recruteur).toEqual(["parcours", "references", "coordonnees"]);
    expect(blocsParProfil.developpeur).toEqual(["contributions"]);
    expect(blocsParProfil.client).toEqual(["etudes", "coordonnees"]);
    expect(blocsParProfil.partenaire).toEqual(["etudes", "coordonnees"]);
  });
});

describe("paragraphes", () => {
  it("coupe sur les retours à la ligne et ignore les lignes vides", () => {
    expect(paragraphes("Un.\n\n  Deux.  \r\nTrois.\rQuatre.")).toEqual([
      "Un.",
      "Deux.",
      "Trois.",
      "Quatre.",
    ]);
    expect(paragraphes(null)).toEqual([]);
    expect(paragraphes(" \n ")).toEqual([]);
  });

  it("garde le balisage tel quel, sans l'interpréter", () => {
    expect(paragraphes("<b>x</b><script>\n**gras**")).toEqual(["<b>x</b><script>", "**gras**"]);
  });
});

describe("projetsPourContributeurs", () => {
  const ouvert = {
    id: "a",
    titre: "Projet A",
    contribuer: "Prendre un ticket.",
    liens: [
      { libelle: "Code source", url: "https://github.com/exemple/a" },
      { libelle: "Contribuer", url: "https://github.com/exemple/a/blob/main/CONTRIBUTING.md" },
    ],
  };
  const ferme = {
    id: "b",
    titre: "Projet B",
    contribuer: null,
    liens: [
      { libelle: "Feuille de route", url: "https://github.com/exemple/b/blob/main/ROADMAP.md" },
      { libelle: "Lien cassé", url: "pas une adresse" },
    ],
  };

  it("garde les projets qui disent comment contribuer et repère les documents", () => {
    expect(projetsPourContributeurs([ouvert, ferme])).toEqual({
      ouverts: true,
      projets: [ouvert],
      feuillesDeRoute: [
        { projet: "Projet B", libelle: "Feuille de route", url: ferme.liens[0].url },
      ],
      guides: [{ projet: "Projet A", libelle: "Contribuer", url: ouvert.liens[1].url }],
    });
  });

  it("à défaut, rend tous les projets", () => {
    const resultat = projetsPourContributeurs([ferme]);
    expect(resultat.ouverts).toBe(false);
    expect(resultat.projets).toEqual([ferme]);
    expect(resultat.guides).toEqual([]);
  });
});
