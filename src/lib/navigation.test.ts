import { describe, expect, it } from "vitest";
import {
  isCurrentPath,
  legalSegments,
  localizedPath,
  navLinks,
  switchLocalePath,
} from "@/lib/navigation";

describe("navigation", () => {
  it("construit les adresses localisées", () => {
    expect(localizedPath("fr", "")).toBe("/fr");
    expect(localizedPath("en", "dev")).toBe("/en/dev");
  });

  it("ne liste que les pages publiées", () => {
    const links = navLinks("fr");
    expect(links[0]).toEqual({ href: "/fr", label: "Accueil" });
    expect(links.every((link) => link.href.startsWith("/fr"))).toBe(true);
  });

  it("garde l'onglet Dev hors du menu principal", () => {
    expect(navLinks("fr").map((link) => link.href)).not.toContain("/fr/dev");
  });

  it("marque l'accueil uniquement sur sa propre adresse", () => {
    expect(isCurrentPath("/fr", "/fr")).toBe(true);
    expect(isCurrentPath("/fr/", "/fr")).toBe(true);
    expect(isCurrentPath("/fr/dev", "/fr")).toBe(false);
  });

  it("marque une rubrique sur ses sous-pages", () => {
    expect(isCurrentPath("/fr/dev/zeus-poseidon", "/fr/dev")).toBe(true);
    expect(isCurrentPath("/fr/developpement", "/fr/dev")).toBe(false);
  });

  it("garde la même page en changeant de langue", () => {
    expect(switchLocalePath("/fr", "en")).toBe("/en");
    expect(switchLocalePath("/fr/dev/zeus-poseidon", "en")).toBe("/en/dev/zeus-poseidon");
    expect(switchLocalePath("/en/", "fr")).toBe("/fr");
  });

  it("donne une adresse aux pages légales dans chaque langue", () => {
    expect(localizedPath("fr", legalSegments.legal)).toBe("/fr/mentions-legales");
    expect(localizedPath("en", legalSegments.privacy)).toBe("/en/confidentialite");
  });
});
