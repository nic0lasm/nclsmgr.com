import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ouvrirBase, type Base } from "./base";
import { empreinte } from "./jetons";
import { creerLien, JOUR, type Lien } from "./liens";
import { migrer } from "./migrations";
import {
  fermerSession,
  INACTIVITE_MAX,
  lireSession,
  MAX_SESSIONS_PAR_LIEN,
  NOM_COOKIE,
  ouvrirSession,
} from "./sessions";

const T0 = Date.UTC(2026, 9, 15);

let db: Base;
let lien: Lien;

function vuLe(valeur: string) {
  return (
    db.prepare("SELECT vu_le FROM sessions WHERE id_sha256 = ?").get(empreinte(valeur)) as
      { vu_le: number } | undefined
  )?.vu_le;
}

beforeEach(() => {
  db = ouvrirBase(":memory:");
  migrer(db);
  lien = creerLien(db, { profil: "developpeur", langue: "en", destinataire: "Sam" }, T0).lien;
});

afterEach(() => db.close());

describe("sessions", () => {
  it("utilise un cookie préfixé __Host-", () => {
    expect(NOM_COOKIE).toBe("__Host-espace");
  });

  it("rend le lien de la session et ne stocke que l'empreinte de la valeur", () => {
    const { valeur, expireLe } = ouvrirSession(db, lien, T0);
    expect(expireLe).toBe(lien.expireLe);
    expect(lireSession(db, valeur, T0 + 1000)).toEqual(lien);
    const stockees = db.prepare("SELECT id_sha256 FROM sessions").all() as { id_sha256: Buffer }[];
    expect(stockees).toEqual([{ id_sha256: empreinte(valeur) }]);
  });

  it("refuse une valeur mal formée ou inconnue", () => {
    ouvrirSession(db, lien, T0);
    expect(lireSession(db, undefined, T0)).toBeNull();
    expect(lireSession(db, "x", T0)).toBeNull();
    expect(lireSession(db, "B".repeat(43), T0)).toBeNull();
  });

  it("refuse d'ouvrir une session sur un lien inactif", () => {
    expect(() => ouvrirSession(db, lien, lien.expireLe)).toThrow();
    expect(() => ouvrirSession(db, { ...lien, revoqueLe: T0 }, T0 + 1)).toThrow();
  });

  it("s'arrête à l'expiration du lien et supprime la session", () => {
    const { valeur } = ouvrirSession(db, lien, T0);
    // Visites régulières : l'inactivité ne joue pas, seule l'expiration du lien compte.
    for (let jour = 10; jour < 30; jour += 10) {
      expect(lireSession(db, valeur, T0 + jour * JOUR)).not.toBeNull();
    }
    expect(lireSession(db, valeur, lien.expireLe)).toBeNull();
    expect(vuLe(valeur)).toBeUndefined();
  });

  it("s'arrête après 14 jours sans visite", () => {
    const { valeur } = ouvrirSession(db, lien, T0);
    expect(lireSession(db, valeur, T0 + INACTIVITE_MAX - 1)).not.toBeNull();
    const autre = ouvrirSession(db, lien, T0);
    expect(lireSession(db, autre.valeur, T0 + INACTIVITE_MAX)).toBeNull();
  });

  it("ne réécrit la date de visite qu'une fois par heure", () => {
    const { valeur } = ouvrirSession(db, lien, T0);
    lireSession(db, valeur, T0 + 59 * 60 * 1000);
    expect(vuLe(valeur)).toBe(T0);
    lireSession(db, valeur, T0 + 60 * 60 * 1000);
    expect(vuLe(valeur)).toBe(T0 + 60 * 60 * 1000);
  });

  it("garde au plus 10 sessions par lien, en fermant les plus anciennes", () => {
    const valeurs = Array.from({ length: 12 }, (_, i) => ouvrirSession(db, lien, T0 + i).valeur);
    expect(db.prepare("SELECT count(*) AS n FROM sessions").get()).toEqual({
      n: MAX_SESSIONS_PAR_LIEN,
    });
    expect(lireSession(db, valeurs[0], T0 + 20)).toBeNull();
    expect(lireSession(db, valeurs[1], T0 + 20)).toBeNull();
    expect(lireSession(db, valeurs[2], T0 + 20)).not.toBeNull();
  });

  it("se ferme à la déconnexion", () => {
    const { valeur } = ouvrirSession(db, lien, T0);
    fermerSession(db, valeur);
    expect(lireSession(db, valeur, T0 + 1)).toBeNull();
    expect(() => fermerSession(db, "mal formé")).not.toThrow();
  });
});
