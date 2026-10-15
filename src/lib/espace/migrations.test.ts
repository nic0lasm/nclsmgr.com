import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ouvrirBase, type Base } from "./base";
import { migrer, VERSION_SCHEMA, versionSchema } from "./migrations";

const ouvertes: Base[] = [];
const dossiers: string[] = [];

function baseEnMemoire() {
  const db = ouvrirBase(":memory:");
  ouvertes.push(db);
  return db;
}

afterEach(() => {
  ouvertes.splice(0).forEach((db) => db.close());
  dossiers.splice(0).forEach((dossier) => rmSync(dossier, { recursive: true, force: true }));
});

describe("ouvrirBase", () => {
  it("crée le fichier en 600 et active WAL, clés étrangères et effacement sûr", () => {
    const dossier = mkdtempSync(join(tmpdir(), "espace-"));
    dossiers.push(dossier);
    const chemin = join(dossier, "espace.db");
    const db = ouvrirBase(chemin);
    ouvertes.push(db);
    migrer(db);
    expect(statSync(chemin).mode & 0o777).toBe(0o600);
    expect(statSync(`${chemin}-wal`).mode & 0o777).toBe(0o600);
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.pragma("secure_delete", { simple: true })).toBe(1);
    expect(db.pragma("busy_timeout", { simple: true })).toBe(5000);
  });
});

describe("migrer", () => {
  it("amène une base vide à la dernière version, puis ne fait plus rien", () => {
    const db = baseEnMemoire();
    expect(versionSchema(db)).toBe(0);
    expect(migrer(db)).toBe(VERSION_SCHEMA);
    expect(versionSchema(db)).toBe(VERSION_SCHEMA);
    expect(migrer(db)).toBe(VERSION_SCHEMA);
    const tables = db
      .prepare(
        "SELECT name, strict FROM pragma_table_list WHERE schema = 'main' AND type = 'table'",
      )
      .all() as { name: string; strict: number }[];
    expect(tables.filter((t) => !t.name.startsWith("sqlite_"))).toEqual(
      expect.arrayContaining([
        { name: "liens", strict: 1 },
        { name: "sessions", strict: 1 },
        { name: "consultations", strict: 1 },
        { name: "courriels", strict: 1 },
      ]),
    );
  });

  it("refuse une base plus récente que le code", () => {
    const db = baseEnMemoire();
    db.pragma(`user_version = ${VERSION_SCHEMA + 1}`);
    expect(() => migrer(db)).toThrow(/retour arrière refusé/);
    expect(db.inTransaction).toBe(false);
  });

  it("applique les contraintes du schéma", () => {
    const db = baseEnMemoire();
    migrer(db);
    const inserer = db.prepare(
      `INSERT INTO liens (id, jeton_sha256, profil, langue, destinataire, documents, cree_le, expire_le)
       VALUES (?, ?, ?, ?, 'A', ?, 1, 2)`,
    );
    const empreinte = Buffer.alloc(32, 1);
    expect(() => inserer.run("l-a", empreinte, "inconnu", "fr", "[]")).toThrow(/CHECK/);
    expect(() => inserer.run("l-a", empreinte, "recruteur", "de", "[]")).toThrow(/CHECK/);
    expect(() => inserer.run("l-a", Buffer.alloc(16), "recruteur", "fr", "[]")).toThrow(/CHECK/);
    expect(() => inserer.run("l-a", empreinte, "recruteur", "fr", "{}")).toThrow(/CHECK/);
    inserer.run("l-a", empreinte, "recruteur", "fr", "[]");
    // Tables STRICT : pas de conversion silencieuse d'un texte en entier.
    expect(() =>
      db.prepare("INSERT INTO sessions VALUES (?, 'l-a', 'hier', 1, 2)").run(Buffer.alloc(32, 2)),
    ).toThrow(/cannot store TEXT value in INTEGER column/);
    // Clés étrangères actives : pas de session orpheline, suppression en cascade.
    expect(() =>
      db.prepare("INSERT INTO sessions VALUES (?, 'l-b', 1, 1, 2)").run(Buffer.alloc(32, 3)),
    ).toThrow(/FOREIGN KEY/);
    db.prepare("INSERT INTO sessions VALUES (?, 'l-a', 1, 1, 2)").run(Buffer.alloc(32, 4));
    db.prepare("DELETE FROM liens WHERE id = 'l-a'").run();
    expect(db.prepare("SELECT count(*) AS n FROM sessions").get()).toEqual({ n: 0 });
  });
});
