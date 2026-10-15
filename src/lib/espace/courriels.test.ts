import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ouvrirBase, type Base } from "./base";
import {
  abandonner,
  courrielsAEnvoyer,
  CourrielInvalide,
  FileSaturee,
  marquerEchec,
  marquerEnvoye,
  MAX_CONTACTS_EN_ATTENTE,
  MAX_PAR_HEURE,
  mettreEnFile,
  rediger,
  reserver,
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
const contact: DonneesCourriel["contact"] = {
  nom: "Alex",
  courriel: "alex@example.com",
  message: "Bonjour",
  le: T0,
};
const alerte = { refus: 300, depuis: T0, jusqua: T0 };

let db: Base;

function stockees() {
  return db
    .prepare<[], { donnees: string }>("SELECT donnees FROM courriels ORDER BY id")
    .all()
    .map((ligne) => JSON.parse(ligne.donnees));
}

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
      message: "Bonjour,\r\nune question\u{200b}.",
      le: T0,
    });
    expect(message.repondreA).toBe("alex@example.com");
    expect(message.texte.split("\n").slice(0, 2)).toEqual([
      "Nom : Alex Bcc: victime@example.com",
      "Adresse : alex@example.com",
    ]);
    expect(message.texte).toContain("Bonjour,\nune question.");
  });

  it("retire les caractères qui s'affichent comme du vide ou imitent une adresse", () => {
    const message = rediger("contact", {
      ...contact,
      nom: "Banque\u{a0}<securite@banque.fr>\u{3164}\u{fe0f}\u{2800}",
      message: "a\u{3000}b\u{fe0f}\u{e0100}\u{f0000}",
    });
    expect(message.texte.split("\n")[0]).toBe("Nom : Banque securite@banque.fr");
    expect(message.texte.endsWith("\na b")).toBe(true);
  });

  it.each([
    ["adresse sans domaine", { courriel: "alex@" }],
    ["adresse avec saut de ligne", { courriel: "alex@example.com\nBcc: x@y.z" }],
    ["adresse avec un @ pleine chasse", { courriel: "a\u{ff20}x.com@b.co" }],
    ["adresse non ASCII", { courriel: "élodie@exemple.fr" }],
    ["nom fait seulement de chevrons", { nom: "<>" }],
    ["message vide", { message: "  " }],
    ["message trop long", { message: "x".repeat(5001) }],
    ["message gonflé de caractères invisibles", { message: `x${"\u{200b}".repeat(5000)}` }],
    ["date hors de portée", { le: 1e17 }],
  ])("refuse un contact invalide : %s", (_cas, modification) => {
    expect(() => rediger("contact", { ...contact, ...modification })).toThrow(CourrielInvalide);
  });

  it("refuse des données mal formées", () => {
    expect(() => rediger("ouverture", null)).toThrow(CourrielInvalide);
    expect(() => rediger("ouverture", { ...ouverture, lienId: "../x" })).toThrow(CourrielInvalide);
    expect(() => rediger("alerte", { refus: -1, depuis: T0, jusqua: T0 })).toThrow(
      CourrielInvalide,
    );
    expect(() => rediger("inconnu" as "alerte", {})).toThrow(CourrielInvalide);
    expect(() => rediger("toString" as "alerte", {})).toThrow(CourrielInvalide);
  });
});

describe("file de courriels", () => {
  it("vérifie les données avant de les mettre en file", () => {
    expect(() => mettreEnFile(db, "ouverture", { ...ouverture, le: Number.NaN }, T0)).toThrow();
    expect(db.prepare("SELECT count(*) AS n FROM courriels").get()).toEqual({ n: 0 });
    mettreEnFile(db, "ouverture", ouverture, T0);
    expect(courrielsAEnvoyer(db, T0)).toHaveLength(1);
  });

  it("ne garde que les champs du modèle, nettoyés", () => {
    mettreEnFile(
      db,
      "contact",
      { ...contact, nom: " Alex\u{200b} ", extra: "x" } as DonneesCourriel["contact"],
      T0,
    );
    expect(stockees()).toEqual([{ ...contact, nom: "Alex" }]);
  });

  it(`refuse un message de contact au-delà de ${MAX_CONTACTS_EN_ATTENTE} en attente`, () => {
    for (let i = 0; i < MAX_CONTACTS_EN_ATTENTE; i++) mettreEnFile(db, "contact", contact, T0);
    expect(() => mettreEnFile(db, "contact", contact, T0)).toThrow(FileSaturee);
    mettreEnFile(db, "alerte", alerte, T0);
    marquerEnvoye(db, 1, T0);
    mettreEnFile(db, "contact", contact, T0);
  });

  it("envoie les alertes d'abord et les messages de contact en dernier", () => {
    mettreEnFile(db, "contact", contact, T0);
    mettreEnFile(db, "ouverture", ouverture, T0 + 1);
    mettreEnFile(db, "alerte", alerte, T0 + 2);
    expect(courrielsAEnvoyer(db, T0 + 3).map((c) => c.modele)).toEqual([
      "alerte",
      "ouverture",
      "contact",
    ]);
  });

  it(`n'envoie pas plus de ${MAX_PAR_HEURE} courriels par heure glissante`, () => {
    for (let i = 0; i < MAX_PAR_HEURE + 5; i++) mettreEnFile(db, "ouverture", ouverture, T0);
    const premiers = courrielsAEnvoyer(db, T0);
    expect(premiers).toHaveLength(MAX_PAR_HEURE);
    premiers.forEach((courriel) => marquerEnvoye(db, courriel.id, T0));
    expect(courrielsAEnvoyer(db, T0 + 59 * MINUTE)).toEqual([]);
    expect(courrielsAEnvoyer(db, T0 + 61 * MINUTE)).toHaveLength(5);
  });

  it("réserve un courriel le temps de son envoi", () => {
    const id = mettreEnFile(db, "ouverture", ouverture, T0);
    expect(reserver(db, id, T0)).toBe(true);
    expect(reserver(db, id, T0)).toBe(false);
    expect(courrielsAEnvoyer(db, T0 + 9 * MINUTE)).toEqual([]);
    expect(courrielsAEnvoyer(db, T0 + 10 * MINUTE)).toHaveLength(1);
  });

  it("espace les essais après un échec, jusqu'à 6 heures, sans abandonner", () => {
    const id = mettreEnFile(db, "ouverture", ouverture, T0);
    marquerEchec(db, id, T0);
    expect(courrielsAEnvoyer(db, T0 + MINUTE)).toEqual([]);
    expect(courrielsAEnvoyer(db, T0 + 2 * MINUTE)).toHaveLength(1);
    marquerEchec(db, id, T0 + 2 * MINUTE);
    expect(courrielsAEnvoyer(db, T0 + 5 * MINUTE)).toEqual([]);
    expect(courrielsAEnvoyer(db, T0 + 6 * MINUTE)).toHaveLength(1);
    for (let i = 0; i < 30; i++) marquerEchec(db, id, T0);
    expect(courrielsAEnvoyer(db, T0 + 6 * 60 * MINUTE - 1)).toEqual([]);
    expect(courrielsAEnvoyer(db, T0 + 6 * 60 * MINUTE)).toHaveLength(1);
  });

  it("n'envoie plus un courriel abandonné", () => {
    const id = mettreEnFile(db, "ouverture", ouverture, T0);
    abandonner(db, id, T0);
    expect(courrielsAEnvoyer(db, T0 + 30 * 24 * 60 * MINUTE)).toEqual([]);
    expect(reserver(db, id, T0)).toBe(false);
  });
});
