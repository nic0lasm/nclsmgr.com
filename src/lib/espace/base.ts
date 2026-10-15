import "server-only";
import { chmodSync, closeSync, openSync } from "node:fs";
import Database from "better-sqlite3";
import { migrer } from "./migrations";

export type Base = Database.Database;

/** Attente du verrou d'écriture par défaut, commune aux deux services (web et courrier). */
export const ATTENTE_VERROU_MS = 5000;
/**
 * Attente du verrou d'écriture pour le journal des consultations. better-sqlite3 est synchrone :
 * pendant cette attente, tout le processus web est gelé. Au-delà, la ligne est perdue.
 */
export const ATTENTE_JOURNAL_MS = 100;

/** Ouvre la base avec les réglages communs aux deux services (web et courrier). */
export function ouvrirBase(chemin: string, attenteMs = ATTENTE_VERROU_MS): Base {
  if (chemin !== ":memory:") {
    // Le fichier est créé en 600 avant que SQLite ne l'ouvre : les fichiers -wal et -shm
    // reprennent les droits du fichier principal.
    closeSync(openSync(chemin, "a", 0o600));
    chmodSync(chemin, 0o600);
  }
  const db = new Database(chemin, { timeout: attenteMs });
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    // Les lignes supprimées (liens, sessions, journal) sont écrasées, pas seulement délistées.
    db.pragma("secure_delete = ON");
    db.pragma("trusted_schema = OFF");
  } catch (erreur) {
    db.close();
    throw erreur;
  }
  return db;
}

const globale = globalThis as typeof globalThis & { espaceBase?: Base; espaceBaseJournal?: Base };

export function espaceConfigure(): boolean {
  return Boolean(process.env.ESPACE_BASE);
}

/** Base du service web : ouverte et migrée une seule fois par processus. */
export function base(): Base {
  if (!globale.espaceBase) {
    const chemin = process.env.ESPACE_BASE;
    if (!chemin) throw new Error("ESPACE_BASE n'est pas défini : l'espace privé est désactivé.");
    const db = ouvrirBase(chemin);
    try {
      migrer(db);
    } catch (erreur) {
      db.close();
      throw erreur;
    }
    globale.espaceBase = db;
  }
  return globale.espaceBase;
}

/**
 * Connexion réservée au journal des consultations, écrit par after() : même fichier, mêmes
 * réglages, mais une attente du verrou de ATTENTE_JOURNAL_MS seulement. Si le service courrier
 * tient le verrou d'écriture, la ligne du journal est abandonnée au lieu de geler le processus.
 * Ouverte une fois, après la connexion principale qui migre la base. Une base en mémoire (tests)
 * ne se partage pas entre connexions : la connexion principale sert alors.
 */
export function baseJournal(): Base {
  const principale = base();
  const chemin = process.env.ESPACE_BASE;
  if (!chemin || chemin === ":memory:") return principale;
  globale.espaceBaseJournal ??= ouvrirBase(chemin, ATTENTE_JOURNAL_MS);
  return globale.espaceBaseJournal;
}

/**
 * Code d'une erreur SQLite (SQLITE_BUSY, SQLITE_READONLY…), seul détail qu'un journal
 * applicatif peut porter : le message d'une erreur peut reprendre des données.
 */
export function codeErreur(erreur: unknown): string {
  return erreur instanceof Database.SqliteError && /^SQLITE_[A-Z_]+$/.test(erreur.code)
    ? erreur.code
    : "erreur non SQLite";
}
