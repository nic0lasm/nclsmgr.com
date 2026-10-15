import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lirePrive, PriveInvalide, typeContact, validerPrive, vide } from "./prive";

// Données entièrement fictives : numéro de la plage réservée à la fiction, domaine example.
const FICTIF = {
  fr: {
    coordonnees: {
      telephone: "+33 6 39 98 00 00",
      email: "contact@example.com",
      ville: "Villefictive",
      linkedin: "https://www.linkedin.com/in/exemple-fictif",
    },
    references: [
      {
        nom: "Camille Fictive",
        role: "Directrice de programme",
        organisation: "Société Exemple",
        texte: "Première ligne.\r\nDeuxième ligne.",
        contact: "camille@example.com",
      },
    ],
  },
};

describe("validerPrive", () => {
  it("accepte un fichier complet et normalise les textes", () => {
    const fichier = validerPrive(FICTIF);
    expect(fichier.fr?.coordonnees).toEqual(FICTIF.fr.coordonnees);
    expect(fichier.fr?.references[0]).toEqual({
      ...FICTIF.fr.references[0],
      texte: "Première ligne.\nDeuxième ligne.",
    });
    expect(fichier.en).toBeUndefined();
  });

  it("accepte des blocs absents ou vides", () => {
    expect(validerPrive({})).toEqual({});
    expect(validerPrive({ en: {} })).toEqual({ en: vide() });
    expect(validerPrive({ fr: { coordonnees: { ville: " " }, references: [] } })).toEqual({
      fr: vide(),
    });
    expect(validerPrive({ fr: { references: [{ nom: "Camille" }] } }).fr?.references).toEqual([
      { nom: "Camille", role: null, organisation: null, texte: null, contact: null },
    ]);
  });

  it.each([
    ["une liste à la racine", []],
    ["une langue inconnue", { de: {} }],
    ["une clé inconnue", { fr: { adresse: "x" } }],
    ["une clé inconnue dans les coordonnées", { fr: { coordonnees: { fax: "x" } } }],
    ["un téléphone mal formé", { fr: { coordonnees: { telephone: "appeler le soir" } } }],
    ["un e-mail mal formé", { fr: { coordonnees: { email: "pas une adresse" } } }],
    ["un LinkedIn hors https", { fr: { coordonnees: { linkedin: "http://linkedin.com/in/x" } } }],
    ["un LinkedIn d'un autre site", { fr: { coordonnees: { linkedin: "https://example.com" } } }],
    [
      "un LinkedIn à domaine trompeur",
      { fr: { coordonnees: { linkedin: "https://linkedin.com.example.com/in/x" } } },
    ],
    ["une ville sur deux lignes", { fr: { coordonnees: { ville: "A\nB" } } }],
    ["un caractère invisible", { fr: { coordonnees: { ville: "Ville\u{200B}" } } }],
    ["une référence sans nom", { fr: { references: [{ role: "x" }] } }],
    ["un nom qui n'est pas un texte", { fr: { references: [{ nom: 42 }] } }],
    ["un texte trop long", { fr: { references: [{ nom: "x", texte: "a".repeat(1001) }] } }],
    [
      "trop de références",
      { fr: { references: Array.from({ length: 11 }, () => ({ nom: "x" })) } },
    ],
  ])("refuse %s", (_cas, json) => {
    expect(() => validerPrive(json)).toThrow(PriveInvalide);
  });

  it("ne cite jamais une valeur ni une clé inconnue dans l'erreur", () => {
    const erreurs = [
      { fr: { coordonnees: { telephone: "secret-123" } } },
      { fr: { "secret-123": 1 } },
    ].map((json) => {
      try {
        validerPrive(json);
        return "";
      } catch (erreur) {
        return (erreur as Error).message;
      }
    });
    expect(erreurs).toEqual(["fr.coordonnees.telephone", "fr, clé inconnue"]);
  });
});

describe("typeContact", () => {
  it("reconnaît un e-mail, un téléphone, sinon du texte", () => {
    expect(typeContact("camille@example.com")).toBe("email");
    expect(typeContact("+33 6 39 98 00 00")).toBe("telephone");
    expect(typeContact("sur demande")).toBe("texte");
  });
});

describe("lirePrive", () => {
  let dossier: string;
  const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    dossier = mkdtempSync(join(tmpdir(), "espace-prive-"));
    vi.stubEnv("ESPACE_PRIVE", dossier);
    erreurs.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dossier, { recursive: true, force: true });
  });

  const ecrire = (contenu: string) =>
    writeFileSync(join(dossier, "prive.json"), contenu, { mode: 0o600 });
  const journal = () => erreurs.mock.calls.flat().join("\n");

  it("lit les données de la langue demandée", async () => {
    ecrire(JSON.stringify(FICTIF));
    expect((await lirePrive("fr")).coordonnees?.ville).toBe("Villefictive");
    expect(await lirePrive("en")).toEqual(vide());
    expect(erreurs).not.toHaveBeenCalled();
  });

  it("rend une structure vide sans rien journaliser quand le fichier manque", async () => {
    expect(await lirePrive("fr")).toEqual(vide());
    expect(erreurs).not.toHaveBeenCalled();
  });

  it("rend une structure vide et journalise sans contenu quand le JSON est illisible", async () => {
    ecrire('{"fr": {"coordonnees": {"telephone": "+33 6 39 98 00 00"');
    expect(await lirePrive("fr")).toEqual(vide());
    expect(erreurs).toHaveBeenCalledTimes(1);
    expect(journal()).toContain("JSON illisible");
    expect(journal()).not.toContain("39 98");
  });

  it("rend une structure vide quand le fichier est invalide, en ne citant que le champ", async () => {
    ecrire(JSON.stringify({ fr: { ...FICTIF.fr, coordonnees: { email: "Villefictive" } } }));
    expect(await lirePrive("fr")).toEqual(vide());
    expect(journal()).toContain("fr.coordonnees.email");
    expect(journal()).not.toContain("Villefictive");
    expect(journal()).not.toContain("Camille");
  });

  it("ignore un fichier trop grand", async () => {
    ecrire(JSON.stringify({ fr: { references: [] }, bourrage: "x".repeat(70_000) }));
    expect(await lirePrive("fr")).toEqual(vide());
    expect(journal()).toContain("trop grand");
  });

  it("ignore un dossier à la place du fichier", async () => {
    mkdirSync(join(dossier, "prive.json"), { mode: 0o700 });
    expect(await lirePrive("fr")).toEqual(vide());
    expect(journal()).toContain("type inattendu");
  });
});
