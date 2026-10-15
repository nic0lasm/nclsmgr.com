import { describe, expect, it } from "vitest";
import { CHEMINS_PRIVES, filtreMesureScript, identifiantMesure } from "./mesure";

describe("identifiantMesure", () => {
  it("accepte un UUID", () => {
    expect(identifiantMesure("0b7f3c1e-2a4d-4c6b-9e8f-1a2b3c4d5e6f")).toBe(
      "0b7f3c1e-2a4d-4c6b-9e8f-1a2b3c4d5e6f",
    );
  });

  it.each([undefined, "", "abc", '0b7f3c1e-2a4d-4c6b-9e8f-1a2b3c4d5e6f" onload="x'])(
    "refuse %s",
    (valeur) => {
      expect(identifiantMesure(valeur)).toBeNull();
    },
  );
});

describe("filtre des chemins privés", () => {
  it.each(["/fr/p", "/en/p/", "/fr/espace", "/en/espace/sortie"])("exclut %s", (chemin) => {
    expect(CHEMINS_PRIVES.test(chemin)).toBe(true);
  });

  it.each(["/fr", "/fr/portfolio", "/en/cv", "/fr/projets"])("mesure %s", (chemin) => {
    expect(CHEMINS_PRIVES.test(chemin)).toBe(false);
  });

  it("annule l'envoi sur l'espace privé et le laisse passer ailleurs", () => {
    const fenetre: Record<string, unknown> = {};
    new Function("window", "location", filtreMesureScript)(fenetre, {
      href: "https://nclsmgr.com/fr",
    });
    const filtre = fenetre.nclsmgrMesure as (t: string, p: { url: string }) => unknown;
    expect(filtre("event", { url: "https://nclsmgr.com/fr/p" })).toBeNull();
    expect(filtre("event", { url: "https://nclsmgr.com/fr/cv" })).toEqual({
      url: "https://nclsmgr.com/fr/cv",
    });
  });
});
