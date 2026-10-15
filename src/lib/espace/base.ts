import "server-only";
import { chmodSync, closeSync, openSync } from "node:fs";
import Database from "better-sqlite3";
import { migrer } from "./migrations";

export type Base = Database.Database;

/** Ouvre la base avec les réglages communs aux deux services (web et courrier). */
export function ouvrirBase(chemin: string): Base {
  if (chemin !== ":memory:") {
    // Le fichier est créé en 600 avant que SQLite ne l'ouvre : les fichiers -wal et -shm
    // reprennent les droits du fichier principal.
    closeSync(openSync(chemin, "a", 0o600));
    chmodSync(chemin, 0o600);
  }
  const db = new Database(chemin, { timeout: 5000 });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // Les lignes supprimées (liens, sessions, journal) sont écrasées, pas seulement délistées.
  db.pragma("secure_delete = ON");
  db.pragma("trusted_schema = OFF");
  return db;
}

const globale = globalThis as typeof globalThis & { espaceBase?: Base };

export function espaceConfigure(): boolean {
  return Boolean(process.env.ESPACE_BASE);
}

/** Base du service web : ouverte et migrée une seule fois par processus. */
export function base(): Base {
  if (!globale.espaceBase) {
    const chemin = process.env.ESPACE_BASE;
    if (!chemin) throw new Error("ESPACE_BASE n'est pas défini : l'espace privé est désactivé.");
    const db = ouvrirBase(chemin);
    migrer(db);
    globale.espaceBase = db;
  }
  return globale.espaceBase;
}
