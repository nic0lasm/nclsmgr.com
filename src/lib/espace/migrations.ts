import "server-only";
import type { Database } from "better-sqlite3";

// Une migration par entrée, jamais modifiée une fois publiée : la version du schéma est
// l'indice de la dernière appliquée, rangée dans PRAGMA user_version.
// Les dates sont des millisecondes depuis l'époque Unix (Date.now()).
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE liens (
    id TEXT PRIMARY KEY,
    jeton_sha256 BLOB NOT NULL UNIQUE CHECK (length(jeton_sha256) = 32),
    profil TEXT NOT NULL CHECK (profil IN ('recruteur', 'developpeur', 'client', 'partenaire')),
    langue TEXT NOT NULL CHECK (langue IN ('fr', 'en')),
    destinataire TEXT NOT NULL,
    organisation TEXT,
    message TEXT,
    documents TEXT NOT NULL CHECK (json_valid(documents) AND json_type(documents) = 'array'),
    note TEXT,
    cree_le INTEGER NOT NULL,
    expire_le INTEGER NOT NULL CHECK (expire_le > cree_le),
    revoque_le INTEGER,
    ouvert_le INTEGER
  ) STRICT;

  CREATE INDEX liens_fin ON liens (expire_le, revoque_le);

  CREATE TABLE sessions (
    id_sha256 BLOB PRIMARY KEY CHECK (length(id_sha256) = 32),
    lien_id TEXT NOT NULL REFERENCES liens (id) ON DELETE CASCADE,
    cree_le INTEGER NOT NULL,
    vu_le INTEGER NOT NULL,
    expire_le INTEGER NOT NULL
  ) STRICT;

  CREATE INDEX sessions_lien ON sessions (lien_id);

  CREATE TABLE consultations (
    id INTEGER PRIMARY KEY,
    lien_id TEXT NOT NULL REFERENCES liens (id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('ouverture', 'document', 'essai_refuse')),
    document TEXT,
    le INTEGER NOT NULL,
    pays TEXT,
    navigateur TEXT
  ) STRICT;

  CREATE INDEX consultations_lien ON consultations (lien_id, le);
  CREATE INDEX consultations_le ON consultations (le);

  CREATE TABLE courriels (
    id INTEGER PRIMARY KEY,
    modele TEXT NOT NULL CHECK (modele IN ('ouverture', 'essai_refuse', 'alerte', 'contact')),
    donnees TEXT NOT NULL CHECK (json_valid(donnees)),
    cree_le INTEGER NOT NULL,
    envoye_le INTEGER,
    essais INTEGER NOT NULL DEFAULT 0
  ) STRICT;

  CREATE INDEX courriels_en_attente ON courriels (cree_le) WHERE envoye_le IS NULL;
  `,
  // 2 : suivi des envois. prochain_le espace les essais après un échec et réserve un courriel
  // pendant son envoi ; abandonne_le marque un courriel dont les données ne se relisent plus.
  `
  ALTER TABLE courriels ADD COLUMN prochain_le INTEGER;
  ALTER TABLE courriels ADD COLUMN abandonne_le INTEGER;
  `,
  // 3 : la dernière notification d'un modèle (essai sur un lien inactif, alerte) se cherche par
  // modèle et par date, sans parcourir toute la file à chaque refus.
  `
  CREATE INDEX courriels_modele ON courriels (modele, cree_le);
  `,
];

export const VERSION_SCHEMA = MIGRATIONS.length;

export function versionSchema(db: Database): number {
  return db.pragma("user_version", { simple: true }) as number;
}

/**
 * Applique les migrations manquantes. Seul le service web l'appelle ; le service courrier
 * attend que la base soit à VERSION_SCHEMA. BEGIN IMMEDIATE prend le verrou d'écriture avant
 * de lire la version : deux démarrages simultanés ne peuvent pas migrer deux fois.
 */
export function migrer(db: Database): number {
  db.exec("BEGIN IMMEDIATE");
  try {
    const actuelle = versionSchema(db);
    if (actuelle > VERSION_SCHEMA) {
      throw new Error(
        `Base en version ${actuelle}, plus récente que le code (${VERSION_SCHEMA}) : retour arrière refusé.`,
      );
    }
    for (let version = actuelle + 1; version <= VERSION_SCHEMA; version++) {
      db.exec(MIGRATIONS[version - 1]);
      db.pragma(`user_version = ${version}`);
    }
    db.exec("COMMIT");
    return VERSION_SCHEMA;
  } catch (erreur) {
    db.exec("ROLLBACK");
    throw erreur;
  }
}
