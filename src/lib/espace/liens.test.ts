import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ouvrirBase, type Base } from "./base";
import {
  creerLien,
  DonneesInvalides,
  DUREE_MAX_JOURS,
  JOUR,
  revoquerLien,
  verifierJeton,
  type NouveauLien,
} from "./liens";
import { migrer } from "./migrations";
import { lireSession, ouvrirSession } from "./sessions";

const T0 = Date.UTC(2026, 9, 15);
const nouveau: NouveauLien = { profil: "recruteur", langue: "fr", destinataire: "Camille" };

let db: Base;

beforeEach(() => {
  db = ouvrirBase(":memory:");
  migrer(db);
});

afterEach(() => db.close());

describe("creerLien", () => {
  it("rend le jeton mais ne stocke que son empreinte", () => {
    const dossier = mkdtempSync(join(tmpdir(), "espace-"));
    const chemin = join(dossier, "espace.db");
    const fichier = ouvrirBase(chemin);
    try {
      migrer(fichier);
      const { jeton, lien } = creerLien(fichier, nouveau, T0);
      fichier.pragma("wal_checkpoint(TRUNCATE)");
      const brut = readFileSync(chemin);
      expect(brut.includes(jeton)).toBe(false);
      expect(brut.includes(Buffer.from(jeton, "base64url"))).toBe(false);
      expect(brut.includes(lien.id)).toBe(true);
    } finally {
      fichier.close();
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it("expire après 30 jours par défaut, ou la durée demandée", () => {
    expect(creerLien(db, nouveau, T0).lien.expireLe).toBe(T0 + 30 * JOUR);
    expect(creerLien(db, { ...nouveau, dureeJours: 1 }, T0).lien.expireLe).toBe(T0 + JOUR);
    expect(creerLien(db, { ...nouveau, dureeJours: DUREE_MAX_JOURS }, T0).lien.expireLe).toBe(
      T0 + 180 * JOUR,
    );
  });

  it("nettoie les textes et garde les champs facultatifs vides à null", () => {
    const { lien } = creerLien(
      db,
      { ...nouveau, destinataire: "  Camille  ", organisation: " ", documents: ["cv-complet"] },
      T0,
    );
    expect(lien).toMatchObject({
      destinataire: "Camille",
      organisation: null,
      message: null,
      documents: ["cv-complet"],
    });
    expect(verifierJeton(db, creerLien(db, nouveau, T0).jeton, T0).lien?.documents).toEqual([]);
  });

  it.each<[string, Partial<NouveauLien>]>([
    ["durée nulle", { dureeJours: 0 }],
    ["durée trop longue", { dureeJours: DUREE_MAX_JOURS + 1 }],
    ["durée non entière", { dureeJours: 1.5 }],
    ["profil inconnu", { profil: "admin" as NouveauLien["profil"] }],
    ["langue inconnue", { langue: "de" as NouveauLien["langue"] }],
    ["destinataire vide", { destinataire: "   " }],
    ["destinataire trop long", { destinataire: "x".repeat(121) }],
    ["caractère de contrôle", { destinataire: "Camille\u0007" }],
    ["retour à la ligne hors message", { organisation: "A\nB" }],
    ["caractère de direction", { message: "Bonjour \u202e" }],
    ["document mal nommé", { documents: ["../prive.json"] }],
    ["document en double", { documents: ["cv", "cv"] }],
    ["trop de documents", { documents: Array.from({ length: 21 }, (_, i) => `d${i}`) }],
  ])("refuse : %s", (_cas, modification) => {
    expect(() => creerLien(db, { ...nouveau, ...modification }, T0)).toThrow(DonneesInvalides);
    expect(db.prepare("SELECT count(*) AS n FROM liens").get()).toEqual({ n: 0 });
  });

  it("accepte les retours à la ligne dans le message", () => {
    const { lien } = creerLien(db, { ...nouveau, message: "Bonjour,\nà bientôt" }, T0);
    expect(lien.message).toBe("Bonjour,\nà bientôt");
  });
});

describe("verifierJeton", () => {
  it("accepte un jeton actif", () => {
    const { jeton, lien } = creerLien(db, nouveau, T0);
    expect(verifierJeton(db, jeton, T0 + 1000)).toEqual({ valide: true, lien });
  });

  it("refuse un jeton mal formé ou inconnu sans dévoiler de lien", () => {
    creerLien(db, nouveau, T0);
    expect(verifierJeton(db, "abc", T0)).toEqual({ valide: false, lien: null });
    expect(verifierJeton(db, null, T0)).toEqual({ valide: false, lien: null });
    expect(verifierJeton(db, "A".repeat(43), T0)).toEqual({ valide: false, lien: null });
  });

  it("refuse un lien expiré ou révoqué, en le rendant pour le journal", () => {
    const { jeton, lien } = creerLien(db, { ...nouveau, dureeJours: 1 }, T0);
    expect(verifierJeton(db, jeton, T0 + JOUR)).toEqual({ valide: false, lien });

    const autre = creerLien(db, nouveau, T0);
    revoquerLien(db, autre.lien.id, T0 + 10);
    expect(verifierJeton(db, autre.jeton, T0 + 20)).toMatchObject({
      valide: false,
      lien: { id: autre.lien.id, revoqueLe: T0 + 10 },
    });
  });
});

describe("revoquerLien", () => {
  it("coupe les sessions ouvertes et ne révoque qu'une fois", () => {
    const { lien } = creerLien(db, nouveau, T0);
    const autre = creerLien(db, nouveau, T0);
    const session = ouvrirSession(db, lien, T0);
    const sessionAutre = ouvrirSession(db, autre.lien, T0);

    expect(revoquerLien(db, lien.id, T0 + 1)).toBe(true);
    expect(revoquerLien(db, lien.id, T0 + 2)).toBe(false);
    expect(revoquerLien(db, "l-inconnu", T0 + 2)).toBe(false);

    expect(lireSession(db, session.valeur, T0 + 3)).toBeNull();
    expect(lireSession(db, sessionAutre.valeur, T0 + 3)?.id).toBe(autre.lien.id);
    expect(db.prepare("SELECT count(*) AS n FROM sessions WHERE lien_id = ?").get(lien.id)).toEqual(
      { n: 0 },
    );
  });
});
