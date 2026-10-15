import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, stripComments } from "./markdown";

describe("parseInline", () => {
  it("reconnaît le gras, le code et les liens", () => {
    expect(parseInline("Voir **ceci**, `__Host-x` et [la page](/contact).")).toEqual([
      { type: "text", value: "Voir " },
      { type: "strong", value: "ceci" },
      { type: "text", value: ", " },
      { type: "code", value: "__Host-x" },
      { type: "text", value: " et " },
      { type: "link", value: "la page", href: "/contact" },
      { type: "text", value: "." },
    ]);
  });

  it("laisse le HTML brut sous forme de texte", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([
      { type: "text", value: "<script>alert(1)</script>" },
    ]);
  });
});

describe("parseMarkdown", () => {
  const source = [
    "---",
    "titre: Confidentialité",
    "description: Données traitées",
    "---",
    "",
    "Premier paragraphe",
    "sur deux lignes.",
    "<!-- note interne -->",
    "## Ce qui est traité",
    "",
    "| Données | Durée |",
    "| --- | --- |",
    "| Messages | 12 mois |",
    "",
    "- un",
    "- deux",
  ].join("\n");

  it("lit le frontmatter et les blocs, sans les commentaires", () => {
    const doc = parseMarkdown(source);
    expect(doc.frontmatter).toEqual({ titre: "Confidentialité", description: "Données traitées" });
    expect(doc.blocks.map((b) => b.type)).toEqual(["paragraph", "heading", "table", "list"]);
    expect(doc.blocks[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", value: "Premier paragraphe sur deux lignes." }],
    });
    expect(JSON.stringify(doc)).not.toContain("note interne");
  });

  it("découpe les tableaux en en-têtes et lignes", () => {
    const table = parseMarkdown(source).blocks[2];
    expect(table).toEqual({
      type: "table",
      header: [[{ type: "text", value: "Données" }], [{ type: "text", value: "Durée" }]],
      rows: [[[{ type: "text", value: "Messages" }], [{ type: "text", value: "12 mois" }]]],
    });
  });
});

describe("robustesse", () => {
  it("traite une ligne isolée commençant par | comme du texte", () => {
    expect(parseMarkdown("Texte\n| note isolée\nsuite").blocks).toEqual([
      { type: "paragraph", content: [{ type: "text", value: "Texte" }] },
      { type: "paragraph", content: [{ type: "text", value: "| note isolée suite" }] },
    ]);
  });

  it("ignore le BOM en tête de fichier", () => {
    expect(parseMarkdown("\uFEFF---\ntitre: A\n---\nTexte").frontmatter).toEqual({ titre: "A" });
  });

  it.each(["# Titre", "#### Titre", "1. Premier", "---", "> citation"])(
    "refuse la syntaxe non prise en charge : %s",
    (line) => {
      expect(() => parseMarkdown(`Texte\n\n${line}`)).toThrow(/non prise en charge/);
    },
  );

  it.each(["mailto:a@b.c", "http://exemple.fr", "javascript:alert(1)"])(
    "refuse les liens hors site non https : %s",
    (href) => {
      expect(() => parseInline(`[lien](${href})`)).toThrow(/Lien non pris en charge/);
    },
  );
});

describe("stripComments", () => {
  it("retire aussi les commentaires imbriqués", () => {
    expect(stripComments("a<!<!-- x -->-- y -->b")).toBe("ab");
    expect(stripComments("a<!--<!-- x -->b")).toBe("ab");
  });
});
