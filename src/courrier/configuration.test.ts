import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lireConfiguration } from "./configuration";

const valide = {
  hote: "ssl0.ovh.net",
  port: 465,
  utilisateur: "site@example.com",
  motDePasse: "secret-de-test",
  expediteur: "site@example.com",
  destinataire: "moi@example.com",
};

let dossier: string;
let chemin: string;

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), "smtp-"));
  chemin = join(dossier, "smtp");
});

afterEach(() => rmSync(dossier, { recursive: true, force: true }));

describe("lireConfiguration", () => {
  it("lit un fichier valide", () => {
    writeFileSync(chemin, JSON.stringify(valide));
    expect(lireConfiguration(chemin)).toEqual(valide);
  });

  it("nomme le champ fautif sans jamais afficher le secret", () => {
    writeFileSync(chemin, JSON.stringify({ ...valide, port: 25 }));
    expect(() => lireConfiguration(chemin)).toThrow(/« port »/);
    writeFileSync(chemin, JSON.stringify({ ...valide, destinataire: "secret-de-test" }));
    try {
      lireConfiguration(chemin);
      expect.unreachable();
    } catch (erreur) {
      expect(String(erreur)).toMatch(/« destinataire »/);
      expect(String(erreur)).not.toContain("secret-de-test");
    }
  });

  it("refuse un fichier absent ou mal formé", () => {
    expect(() => lireConfiguration(join(dossier, "absent"))).toThrow(/illisible/);
    writeFileSync(chemin, "pas du json");
    expect(() => lireConfiguration(chemin)).toThrow(/illisible/);
    writeFileSync(chemin, "null");
    expect(() => lireConfiguration(chemin)).toThrow(/invalide/);
  });
});
