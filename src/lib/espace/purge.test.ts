import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ouvrirBase, type Base } from "./base";
import { abandonner, marquerEnvoye, mettreEnFile } from "./courriels";
import { creerLien, JOUR, revoquerLien } from "./liens";
import { migrer } from "./migrations";
import { purger } from "./purge";
import { INACTIVITE_MAX, lireSession, ouvrirSession } from "./sessions";

const T0 = Date.UTC(2026, 9, 15);
const nouveau = { profil: "recruteur", langue: "fr", destinataire: "Camille" } as const;

let db: Base;

function compter(table: string) {
  return (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function consulter(lienId: string, le: number) {
  db.prepare("INSERT INTO consultations (lien_id, type, le) VALUES (?, 'ouverture', ?)").run(
    lienId,
    le,
  );
}

beforeEach(() => {
  db = ouvrirBase(":memory:");
  migrer(db);
});

afterEach(() => db.close());

describe("purger", () => {
  it("supprime un lien terminé depuis plus de 90 jours, avec son journal", () => {
    const expire = creerLien(db, { ...nouveau, dureeJours: 1 }, T0).lien;
    const revoque = creerLien(db, nouveau, T0).lien;
    revoquerLien(db, revoque.id, T0 + JOUR);
    const actif = creerLien(db, { ...nouveau, dureeJours: 180 }, T0).lien;
    consulter(expire.id, T0);

    expect(purger(db, T0 + 90 * JOUR).liens).toBe(0);
    const bilan = purger(db, T0 + 91 * JOUR + 1);
    expect(bilan.liens).toBe(2);
    expect(db.prepare("SELECT id FROM liens").all()).toEqual([{ id: actif.id }]);
    expect(compter("consultations")).toBe(0);
  });

  it("garde le journal 90 jours", () => {
    const { lien } = creerLien(db, { ...nouveau, dureeJours: 180 }, T0);
    consulter(lien.id, T0);
    consulter(lien.id, T0 + 10 * JOUR);
    expect(purger(db, T0 + 95 * JOUR).consultations).toBe(1);
    expect(compter("consultations")).toBe(1);
  });

  it("supprime les sessions expirées ou abandonnées", () => {
    const { lien } = creerLien(db, { ...nouveau, dureeJours: 180 }, T0);
    const ancienne = ouvrirSession(db, lien, T0);
    const recente = ouvrirSession(db, lien, T0 + INACTIVITE_MAX);
    expect(purger(db, T0 + INACTIVITE_MAX + 1).sessions).toBe(1);
    expect(lireSession(db, ancienne.valeur, T0 + INACTIVITE_MAX + 1)).toBeNull();
    expect(lireSession(db, recente.valeur, T0 + INACTIVITE_MAX + 1)).not.toBeNull();
  });

  it("supprime les courriels envoyés, abandonnés ou restés en attente depuis 7 jours", () => {
    const donnees = { refus: 300, depuis: T0, jusqua: T0 };
    const envoye = mettreEnFile(db, "alerte", donnees, T0 - JOUR);
    marquerEnvoye(db, envoye, T0);
    const abandonne = mettreEnFile(db, "alerte", donnees, T0);
    abandonner(db, abandonne, T0);
    mettreEnFile(db, "alerte", donnees, T0);
    mettreEnFile(db, "alerte", donnees, T0 + JOUR);

    expect(purger(db, T0 + 7 * JOUR - 1).courriels).toBe(0);
    expect(purger(db, T0 + 7 * JOUR)).toMatchObject({ courriels: 3, walVide: true });
    expect(compter("courriels")).toBe(1);
  });
});
