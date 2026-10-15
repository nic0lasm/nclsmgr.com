import { mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CatalogueInvalide,
  documentsAffiches,
  lireCatalogue,
  lireDocument,
  TAILLE_MAX_DOCUMENT,
  validerCatalogue,
} from "./documents";

// PDF minimal fictif : seule la signature compte pour le serveur.
const PDF = Buffer.from("%PDF-1.4\n% document fictif\n%%EOF\n", "latin1");

const CATALOGUE = {
  cv: {
    titre: { fr: " CV complet ", en: "Full résumé" },
    fichiers: { fr: "cv-fr.pdf", en: "cv-en.pdf" },
    noms: { fr: "Exemple-CV.pdf", en: "Example-Resume.pdf" },
  },
  annexe: { titre: { fr: "Annexe" }, fichiers: { fr: "annexe_v2.pdf" } },
};

describe("validerCatalogue", () => {
  it("accepte un catalogue complet, normalise les titres et garde l'ordre", () => {
    const catalogue = validerCatalogue(CATALOGUE);
    expect([...catalogue.keys()]).toEqual(["cv", "annexe"]);
    expect(catalogue.get("cv")).toEqual({
      ...CATALOGUE.cv,
      titre: { fr: "CV complet", en: "Full résumé" },
    });
    expect(catalogue.get("annexe")?.noms).toEqual({});
    expect(validerCatalogue({}).size).toBe(0);
  });

  it("ne confond pas un identifiant avec une propriété héritée", () => {
    expect(validerCatalogue(CATALOGUE).get("constructor")).toBeUndefined();
  });

  const entree = (modif: object) => ({ cv: { ...CATALOGUE.cv, ...modif } });

  it.each([
    ["une liste à la racine", []],
    ["un identifiant mal formé", { "../prive": CATALOGUE.cv }],
    ["un identifiant en majuscules", { CV: CATALOGUE.cv }],
    ["un identifiant trop long", { ["a".repeat(41)]: CATALOGUE.cv }],
    ["une clé inconnue", entree({ chemin: "/etc/passwd" })],
    ["une entrée sans titre", { cv: { fichiers: { fr: "cv.pdf" } } }],
    ["une entrée sans fichier", { cv: { titre: { fr: "CV" } } }],
    ["des titres sans langue", entree({ titre: {} })],
    ["une langue inconnue", entree({ titre: { de: "Lebenslauf" } })],
    ["un titre vide", entree({ titre: { fr: "  " } })],
    ["un titre trop long", entree({ titre: { fr: "x".repeat(81) } })],
    ["un titre sur deux lignes", entree({ titre: { fr: "CV\ncomplet" } })],
    ["un caractère invisible", entree({ titre: { fr: "CV\u{200B}" } })],
    ["un titre qui n'est pas un texte", entree({ titre: { fr: 42 } })],
    ["un fichier dans un sous-dossier", entree({ fichiers: { fr: "../prive.pdf" } })],
    ["un fichier avec barre oblique", entree({ fichiers: { fr: "a/b.pdf" } })],
    ["un fichier caché", entree({ fichiers: { fr: ".cv.pdf" } })],
    ["un fichier qui n'est pas un PDF", entree({ fichiers: { fr: "catalogue.json" } })],
    ["un fichier en majuscules", entree({ fichiers: { fr: "CV.pdf" } })],
    ["un nom avec espace", entree({ noms: { fr: "Mon CV.pdf" } })],
    ["un nom avec guillemet", entree({ noms: { fr: 'cv".pdf' } })],
    ["un nom non ASCII", entree({ noms: { fr: "Résumé.pdf" } })],
    ["des noms vides", entree({ noms: {} })],
    [
      "trop d'entrées",
      Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`d${i}`, CATALOGUE.cv])),
    ],
  ])("refuse %s", (_cas, json) => {
    expect(() => validerCatalogue(json)).toThrow(CatalogueInvalide);
  });

  it("ne cite jamais une valeur ni un identifiant mal formé dans l'erreur", () => {
    const messages = [
      { "secret-a": { ...CATALOGUE.cv, titre: { fr: "secret\u{0007}" } } },
      { "Secret B": CATALOGUE.cv },
      { cv: { ...CATALOGUE.cv, secret: 1 } },
    ].map((json) => {
      try {
        validerCatalogue(json);
        return "";
      } catch (erreur) {
        return (erreur as Error).message;
      }
    });
    expect(messages).toEqual(["secret-a.titre.fr", "entrée 1, identifiant", "cv, clé inconnue"]);
  });
});

describe("documentsAffiches", () => {
  const catalogue = validerCatalogue(CATALOGUE);

  it("garde l'ordre du lien et ignore les identifiants absents du catalogue", () => {
    expect(documentsAffiches(catalogue, ["annexe", "inconnu", "cv"], "fr")).toEqual([
      { id: "annexe", titre: "Annexe", langue: "fr" },
      { id: "cv", titre: "CV complet", langue: "fr" },
    ]);
    expect(documentsAffiches(catalogue, [], "fr")).toEqual([]);
  });

  it("prend le titre de la langue de la page, sinon celui d'une autre langue", () => {
    expect(documentsAffiches(catalogue, ["cv", "annexe"], "en")).toEqual([
      { id: "cv", titre: "Full résumé", langue: "en" },
      { id: "annexe", titre: "Annexe", langue: "fr" },
    ]);
  });
});

describe("lecture sur le volume", () => {
  let racine: string;
  let dossier: string;
  const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});
  const journal = () => erreurs.mock.calls.flat().join("\n");

  const ecrire = (nom: string, contenu: string | Buffer) =>
    writeFileSync(join(dossier, nom), contenu, { mode: 0o600 });

  beforeEach(() => {
    racine = mkdtempSync(join(tmpdir(), "espace-documents-"));
    dossier = join(racine, "documents");
    mkdirSync(dossier, { mode: 0o700 });
    vi.stubEnv("ESPACE_PRIVE", racine);
    erreurs.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(racine, { recursive: true, force: true });
  });

  describe("lireCatalogue", () => {
    it("lit un catalogue valide", async () => {
      ecrire("catalogue.json", JSON.stringify(CATALOGUE));
      expect([...(await lireCatalogue()).keys()]).toEqual(["cv", "annexe"]);
      expect(erreurs).not.toHaveBeenCalled();
    });

    it("rend un catalogue vide sans rien journaliser quand le fichier manque", async () => {
      expect((await lireCatalogue()).size).toBe(0);
      rmSync(dossier, { recursive: true });
      expect((await lireCatalogue()).size).toBe(0);
      expect(erreurs).not.toHaveBeenCalled();
    });

    it("rend un catalogue vide et journalise sans contenu quand le JSON est illisible", async () => {
      ecrire("catalogue.json", '{"cv": {"titre": {"fr": "Titre-secret"');
      expect((await lireCatalogue()).size).toBe(0);
      expect(erreurs).toHaveBeenCalledTimes(1);
      expect(journal()).toContain("JSON illisible");
      expect(journal()).not.toContain("Titre-secret");
    });

    it("ne cite que le champ refusé d'un catalogue invalide", async () => {
      ecrire(
        "catalogue.json",
        JSON.stringify({ cv: { ...CATALOGUE.cv, fichiers: { fr: "x/Titre-secret.pdf" } } }),
      );
      expect((await lireCatalogue()).size).toBe(0);
      expect(journal()).toContain("cv.fichiers.fr");
      expect(journal()).not.toContain("Titre-secret");
    });

    it("refuse un catalogue trop grand, un lien symbolique ou un dossier", async () => {
      ecrire("catalogue.json", JSON.stringify({ ...CATALOGUE, bourrage: "x".repeat(20_000) }));
      expect((await lireCatalogue()).size).toBe(0);

      rmSync(join(dossier, "catalogue.json"));
      writeFileSync(join(racine, "ailleurs.json"), JSON.stringify(CATALOGUE), { mode: 0o600 });
      symlinkSync(join(racine, "ailleurs.json"), join(dossier, "catalogue.json"));
      expect((await lireCatalogue()).size).toBe(0);

      rmSync(join(dossier, "catalogue.json"));
      mkdirSync(join(dossier, "catalogue.json"));
      expect((await lireCatalogue()).size).toBe(0);
      expect(erreurs).toHaveBeenCalledTimes(3);
    });
  });

  describe("lireDocument", () => {
    beforeEach(() => {
      ecrire("catalogue.json", JSON.stringify(CATALOGUE));
      ecrire("cv-fr.pdf", PDF);
      ecrire("cv-en.pdf", PDF);
      ecrire("annexe_v2.pdf", PDF);
    });

    it("rend le PDF de la langue demandée avec son nom de téléchargement", async () => {
      const fr = await lireDocument("cv", "fr", ["cv"]);
      expect(Buffer.from(fr?.contenu ?? []).equals(PDF)).toBe(true);
      expect(fr?.nom).toBe("Exemple-CV.pdf");
      expect((await lireDocument("cv", "en", ["cv"]))?.nom).toBe("Example-Resume.pdf");
    });

    it("se rabat sur une autre langue, et sur le nom du fichier faute de nom", async () => {
      expect((await lireDocument("annexe", "en", ["annexe"]))?.nom).toBe("annexe_v2.pdf");
    });

    it("refuse un document qui n'est pas dans le lien", async () => {
      expect(await lireDocument("cv", "fr", [])).toBeNull();
      expect(await lireDocument("cv", "fr", ["annexe"])).toBeNull();
    });

    it("refuse un identifiant absent du catalogue ou mal formé, même autorisé", async () => {
      for (const id of ["inconnu", "constructor", "../catalogue", "cv-fr.pdf", "cv/"]) {
        expect(await lireDocument(id, "fr", [id]), id).toBeNull();
      }
    });

    it("refuse quand le catalogue manque, même si le fichier est là", async () => {
      rmSync(join(dossier, "catalogue.json"));
      expect(await lireDocument("cv", "fr", ["cv"])).toBeNull();
    });

    it("refuse un fichier manquant", async () => {
      rmSync(join(dossier, "cv-fr.pdf"));
      expect(await lireDocument("cv", "fr", ["cv"])).toBeNull();
      expect(erreurs).not.toHaveBeenCalled();
    });

    it("refuse un lien symbolique, même vers un PDF valide", async () => {
      rmSync(join(dossier, "cv-fr.pdf"));
      symlinkSync(join(dossier, "cv-en.pdf"), join(dossier, "cv-fr.pdf"));
      expect(await lireDocument("cv", "fr", ["cv"])).toBeNull();
      expect(journal()).not.toContain("cv-");
    });

    it("refuse un fichier trop grand", async () => {
      ecrire("cv-fr.pdf", PDF);
      truncateSync(join(dossier, "cv-fr.pdf"), TAILLE_MAX_DOCUMENT + 1);
      expect(await lireDocument("cv", "fr", ["cv"])).toBeNull();
      truncateSync(join(dossier, "cv-fr.pdf"), TAILLE_MAX_DOCUMENT);
      expect((await lireDocument("cv", "fr", ["cv"]))?.contenu.byteLength).toBe(
        TAILLE_MAX_DOCUMENT,
      );
    });

    it("refuse un dossier à la place du fichier", async () => {
      rmSync(join(dossier, "cv-fr.pdf"));
      mkdirSync(join(dossier, "cv-fr.pdf"));
      expect(await lireDocument("cv", "fr", ["cv"])).toBeNull();
    });

    it("refuse un fichier qui n'est pas un PDF, ou vide", async () => {
      ecrire("cv-fr.pdf", "<html><script>alert(1)</script></html>");
      expect(await lireDocument("cv", "fr", ["cv"])).toBeNull();
      ecrire("cv-fr.pdf", "");
      expect(await lireDocument("cv", "fr", ["cv"])).toBeNull();
    });
  });
});
