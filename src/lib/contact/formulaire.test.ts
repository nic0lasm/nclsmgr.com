import { describe, expect, it } from "vitest";
import { CHAMP_PIEGE, composerMessage, LIMITES, lireFormulaire } from "./formulaire";

const objets = ["Recrutement", "Projet", "Autre"];

function formulaire(champs: Record<string, string>) {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

const valide = {
  nom: "  Alex Martin ",
  courriel: "alex@example.com",
  objet: "Projet",
  message: "Bonjour",
};

describe("lireFormulaire", () => {
  it("accepte un formulaire complet et nettoie les espaces", () => {
    expect(lireFormulaire(formulaire(valide), objets)).toEqual({
      type: "valide",
      valeurs: { ...valide, nom: "Alex Martin" },
      objet: 1,
    });
  });

  it("signale les champs manquants", () => {
    const lecture = lireFormulaire(formulaire({ nom: " ", objet: "Projet" }), objets);
    expect(lecture).toMatchObject({
      type: "erreurs",
      erreurs: { nom: "manquant", courriel: "manquant", message: "manquant" },
    });
  });

  it("refuse une adresse mal formée ou non ASCII", () => {
    for (const courriel of [
      "alex",
      "alex@",
      "alex@exemple",
      "aléx@example.com",
      "a b@example.com",
    ]) {
      expect(lireFormulaire(formulaire({ ...valide, courriel }), objets)).toMatchObject({
        erreurs: { courriel: "invalide" },
      });
    }
  });

  it("refuse un texte trop long et renvoie une valeur tronquée", () => {
    const message = "a".repeat(LIMITES.message + 1);
    const lecture = lireFormulaire(formulaire({ ...valide, message }), objets);
    expect(lecture).toMatchObject({ type: "erreurs", erreurs: { message: "invalide" } });
    expect(lecture.type === "erreurs" && lecture.valeurs.message.length).toBe(LIMITES.message);
  });

  it("ramène un objet inconnu sur le dernier", () => {
    const lecture = lireFormulaire(formulaire({ ...valide, objet: "<script>" }), objets);
    expect(lecture).toMatchObject({ type: "valide", objet: 2 });
  });

  it("repère le champ piège rempli", () => {
    expect(lireFormulaire(formulaire({ ...valide, [CHAMP_PIEGE]: "x" }), objets)).toEqual({
      type: "piege",
    });
  });

  it("ignore un fichier envoyé à la place d'un texte", () => {
    const donnees = formulaire(valide);
    donnees.set("message", new Blob(["Bonjour"]));
    expect(lireFormulaire(donnees, objets)).toMatchObject({ erreurs: { message: "manquant" } });
  });
});

describe("composerMessage", () => {
  it("précède le message de l'objet et de la langue", () => {
    expect(composerMessage("Projet", "en", "Hello")).toBe(
      "Objet : Projet\nLangue de la page : EN\n\nHello",
    );
  });
});
