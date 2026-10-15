import { describe, expect, it } from "vitest";
import { securityTxt } from "./security-txt";

describe("securityTxt", () => {
  const texte = securityTxt(new Date("2026-10-15T18:30:00Z"));

  it("contient les champs obligatoires de la RFC 9116", () => {
    expect(texte).toMatch(/^Contact: mailto:security@nclsmgr\.com$/m);
    expect(texte).toMatch(/^Expires: 2027-01-13T00:00:00Z$/m);
  });

  it("annonce son adresse canonique", () => {
    expect(texte).toMatch(/^Canonical: https:\/\/nclsmgr\.com\/\.well-known\/security\.txt$/m);
  });

  it("expire à moins d'un an", () => {
    const expires = texte.match(/^Expires: (.+)$/m)?.[1] ?? "";
    const ecart = Date.parse(expires) - Date.parse("2026-10-15T18:30:00Z");
    expect(ecart).toBeGreaterThan(0);
    expect(ecart).toBeLessThan(365 * 24 * 60 * 60 * 1000);
  });
});
