import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ouvrirBase, type Base } from "./base";
import {
  courrielsAEnvoyer,
  CourrielInvalide,
  marquerEchec,
  marquerEnvoye,
  MAX_ESSAIS,
  MAX_PAR_HEURE,
  mettreEnFile,
  rediger,
  type DonneesCourriel,
} from "./courriels";
import { migrer } from "./migrations";

const T0 = Date.UTC(2026, 9, 15, 12, 0);
const MINUTE = 60_000;
const ouverture: DonneesCourriel["ouverture"] = {
  lienId: "l-7kq2mz",
  destinataire: "Camille",
  organisation: "Acme",
  le: T0,
  pays: "FR",
  navigateur: "Firefox",
};

let db: Base;

beforeEach(() => {
  db = ouvrirBase(":memory:");
  migrer(db);
});

afterEach(() => db.close());

describe("rediger", () => {
  it("rédige un sujet fixe et un texte daté à l'heure de Paris", () => {
    const message = rediger("ouverture", ouverture);
    expect(message.sujet).toBe("Espace privé : lien ouvert");
    expect(message.texte).toContain("l-7kq2mz (Camille, Acme)");
    expect(message.texte).toContain("15 octobre 2026 à 14:00");
    expect(message.repondreA).toBeUndefined();
  });

  it("distingue un lien expiré d'un lien révoqué", () => {
    const base = { ...ouverture, finLe: T0 - MINUTE };
    expect(rediger("essai_refuse", { ...base, motif: "expire" }).texte).toContain("expiré le");
    expect(rediger("essai_refuse", { ...base, motif: "revoque" }).texte).toContain("révoqué le");
    expect(() => rediger("essai_refuse", { ...base, motif: "autre" })).toThrow(CourrielInvalide);
  });

  it("neutralise les retours à la ligne et caractères invisibles d'un message de contact", () => {
    const message = rediger("contact", {
      nom: "Alex\r\nBcc: victime@example.com",
      courriel: "alex@example.com",
      message: "Bonjour,\r\nune question\u200b.",
      le: T0,
    });
    expect(message.repondreA).toBe("alex@example.com");
    expect(message.texte.split("\n")[0]).toBe(
      "De : Alex Bcc: victime@example.com <alex@example.com>",
    );
    expect(message.texte).toContain("Bonjour,\nune question.");
  });

  it.each([
    ["adresse sans domaine", { courriel: "alex@" }],
    ["adresse avec saut de ligne", { courriel: "alex@example.com\nBcc: x@y.z" }],
    ["message vide", { message: "  " }],
    ["message trop long", { message: "x".repeat(5001) }],
  ])("refuse un contact invalide : %s", (_cas, modification) => {
    const contact = { nom: "Alex", courriel: "alex@example.com", message: "Bonjour", le: T0 };
    expect(() => rediger("contact", { ...contact, ...modification })).toThrow(CourrielInvalide);
  });

  it("refuse des données mal formées", () => {
    expect(() => rediger("ouverture", null)).toThrow(CourrielInvalide);
    expect(() => rediger("ouverture", { ...ouverture, lienId: "../x" })).toThrow(CourrielInvalide);
    expect(() => rediger("alerte", { refus: -1, depuis: T0, jusqua: T0 })).toThrow(
      CourrielInvalide,
    );
    expect(() => rediger("inconnu" as "alerte", {})).toThrow(CourrielInvalide);
  });
});

describe("file de courriels", () => {
  it("vérifie les données avant de les mettre en file", () => {
    expect(() => mettreEnFile(db, "ouverture", { ...ouverture, le: Number.NaN }, T0)).toThrow();
    expect(db.prepare("SELECT count(*) AS n FROM courriels").get()).toEqual({ n: 0 });
    mettreEnFile(db, "ouverture", ouverture, T0);
    expect(courrielsAEnvoyer(db, T0)).toHaveLength(1);
  });

  it(`n'envoie pas plus de ${MAX_PAR_HEURE} courriels par heure glissante`, () => {
    for (let i = 0; i < MAX_PAR_HEURE + 5; i++) mettreEnFile(db, "ouverture", ouverture, T0);
    const premiers = courrielsAEnvoyer(db, T0);
    expect(premiers).toHaveLength(MAX_PAR_HEURE);
    premiers.forEach((courriel) => marquerEnvoye(db, courriel.id, T0));
    expect(courrielsAEnvoyer(db, T0 + 59 * MINUTE)).toEqual([]);
    expect(courrielsAEnvoyer(db, T0 + 61 * MINUTE)).toHaveLength(5);
  });

  it("espace les essais après un échec, puis abandonne", () => {
    const id = mettreEnFile(db, "ouverture", ouverture, T0);
    marquerEchec(db, id, T0);
    expect(courrielsAEnvoyer(db, T0 + MINUTE)).toEqual([]);
    expect(courrielsAEnvoyer(db, T0 + 2 * MINUTE)).toHaveLength(1);
    marquerEchec(db, id, T0 + 2 * MINUTE);
    expect(courrielsAEnvoyer(db, T0 + 5 * MINUTE)).toEqual([]);
    expect(courrielsAEnvoyer(db, T0 + 6 * MINUTE)).toHaveLength(1);
    marquerEchec(db, id, T0 + 6 * MINUTE, true);
    expect(courrielsAEnvoyer(db, T0 + 30 * 24 * 60 * MINUTE)).toEqual([]);
    expect(db.prepare("SELECT essais FROM courriels").get()).toEqual({ essais: MAX_ESSAIS });
  });
});
