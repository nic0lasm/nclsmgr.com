import { describe, expect, it } from "vitest";
import { formatMonth, formatPeriod } from "./dates";

describe("formatMonth", () => {
  it("écrit le mois en toutes lettres dans chaque langue", () => {
    expect(formatMonth("2020-03", "fr")).toBe("mars 2020");
    expect(formatMonth("2020-03", "en")).toBe("March 2020");
  });
});

describe("formatPeriod", () => {
  it("affiche une période terminée ou en cours", () => {
    expect(formatPeriod("2018-09", "2020-02", "fr", "aujourd'hui")).toBe(
      "septembre 2018 · février 2020",
    );
    expect(formatPeriod("2020-03", null, "en", "present")).toBe("March 2020 · present");
  });

  it("n'affiche que la fin quand le début est inconnu", () => {
    expect(formatPeriod(null, "2015-07", "fr", "aujourd'hui")).toBe("juillet 2015");
  });
});
