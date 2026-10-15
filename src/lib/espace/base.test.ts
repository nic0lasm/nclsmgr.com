import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ATTENTE_JOURNAL_MS, base, baseJournal, codeErreur, ouvrirBase, type Base } from "./base";
import { CompteurRefus, noterOuverture, noterRefus, SEUIL_ALERTE } from "./journal";
import { creerLien } from "./liens";

const globale = globalThis as typeof globalThis & { espaceBase?: Base; espaceBaseJournal?: Base };
const T0 = Date.UTC(2026, 9, 15, 12, 0);
const ici = { pays: "FR", navigateur: "Firefox · Windows" };

let dossier: string;
let chemin: string;
const avant = process.env.ESPACE_BASE;

beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), "espace-base-"));
  chemin = join(dossier, "espace.db");
  process.env.ESPACE_BASE = chemin;
});

afterAll(() => {
  globale.espaceBaseJournal?.close();
  globale.espaceBase?.close();
  delete globale.espaceBaseJournal;
  delete globale.espaceBase;
  if (avant === undefined) delete process.env.ESPACE_BASE;
  else process.env.ESPACE_BASE = avant;
  rmSync(dossier, { recursive: true, force: true });
});

describe("baseJournal", () => {
  it("ouvre une seconde connexion, une seule fois, sur le même fichier et avec 100 ms d'attente", () => {
    const journal = baseJournal();
    expect(journal).not.toBe(base());
    expect(baseJournal()).toBe(journal);
    expect(journal.name).toBe(base().name);
    expect(journal.pragma("busy_timeout", { simple: true })).toBe(ATTENTE_JOURNAL_MS);
    expect(base().pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(journal.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(journal.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(journal.pragma("secure_delete", { simple: true })).toBe(1);
    expect(journal.pragma("trusted_schema", { simple: true })).toBe(0);
    // Ce que la connexion du journal écrit, la connexion principale le lit.
    const { lien } = creerLien(
      base(),
      { profil: "recruteur", langue: "fr", destinataire: "A" },
      T0,
    );
    noterOuverture(journal, lien, ici, T0);
    expect(
      base().prepare("SELECT count(*) AS n FROM consultations WHERE lien_id = ?").get(lien.id),
    ).toEqual({ n: 1 });
  });

  it("abandonne en une centaine de millisecondes quand une autre connexion tient le verrou", () => {
    const { lien } = creerLien(
      base(),
      { profil: "recruteur", langue: "fr", destinataire: "B" },
      T0,
    );
    // Autre connexion, comme le service courrier pendant un envoi ou la purge.
    const courrier = ouvrirBase(chemin);
    courrier.exec("BEGIN IMMEDIATE");
    try {
      const debut = performance.now();
      let erreur: unknown;
      try {
        noterOuverture(baseJournal(), lien, ici, T0);
      } catch (e) {
        erreur = e;
      }
      const duree = performance.now() - debut;
      expect(codeErreur(erreur)).toBe("SQLITE_BUSY");
      expect(duree).toBeGreaterThanOrEqual(ATTENTE_JOURNAL_MS * 0.8);
      expect(duree).toBeLessThan(1000);

      // Le compteur d'alertes ne gèle pas non plus : une tentative, puis un recul.
      const compteur = new CompteurRefus();
      for (let i = 0; i < SEUIL_ALERTE; i++) noterRefus(baseJournal(), compteur, T0);
      const debutAlerte = performance.now();
      expect(() => noterRefus(baseJournal(), compteur, T0)).toThrow();
      for (let i = 0; i < 50; i++) expect(noterRefus(baseJournal(), compteur, T0 + i)).toBe(false);
      expect(performance.now() - debutAlerte).toBeLessThan(1000);
    } finally {
      courrier.exec("ROLLBACK");
      courrier.close();
    }
    // Le verrou rendu, l'écriture passe.
    noterOuverture(baseJournal(), lien, ici, T0);
    expect(
      base().prepare("SELECT count(*) AS n FROM consultations WHERE lien_id = ?").get(lien.id),
    ).toEqual({ n: 1 });
  });
});

describe("codeErreur", () => {
  it("ne garde que le code SQLite, jamais le message", () => {
    expect(codeErreur(new Database.SqliteError("secret Camille", "SQLITE_READONLY"))).toBe(
      "SQLITE_READONLY",
    );
    expect(codeErreur(new Database.SqliteError("secret", "Camille"))).toBe("erreur non SQLite");
    expect(codeErreur(new Error("SQLITE_BUSY secret"))).toBe("erreur non SQLite");
    expect(codeErreur("SQLITE_BUSY")).toBe("erreur non SQLite");
  });
});
