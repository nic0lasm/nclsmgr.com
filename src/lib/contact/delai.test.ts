import { describe, expect, it } from "vitest";
import { AGE_MAX, DELAI_MIN, emettreJeton, jetonValide } from "./delai";

const T0 = Date.UTC(2026, 9, 17, 12, 0);

describe("jeton de délai", () => {
  it("accepte un formulaire rempli entre le délai minimal et l'âge maximal", () => {
    const jeton = emettreJeton(T0);
    expect(jetonValide(jeton, T0 + DELAI_MIN)).toBe(true);
    expect(jetonValide(jeton, T0 + AGE_MAX)).toBe(true);
  });

  it("refuse un envoi trop rapide ou un formulaire trop ancien", () => {
    const jeton = emettreJeton(T0);
    expect(jetonValide(jeton, T0 + DELAI_MIN - 1)).toBe(false);
    expect(jetonValide(jeton, T0 + AGE_MAX + 1)).toBe(false);
  });

  it("refuse un horodatage modifié ou une signature inventée", () => {
    const [, signature] = emettreJeton(T0).split(".");
    const recule = (T0 - 60_000).toString(36);
    expect(jetonValide(`${recule}.${signature}`, T0)).toBe(false);
    expect(jetonValide(`${recule}.${"A".repeat(43)}`, T0)).toBe(false);
  });

  it("refuse un jeton absent ou mal formé", () => {
    for (const jeton of [null, "", ".", "abc", `${emettreJeton(T0)}.x`, "x".repeat(200)]) {
      expect(jetonValide(jeton, T0 + DELAI_MIN)).toBe(false);
    }
  });
});
