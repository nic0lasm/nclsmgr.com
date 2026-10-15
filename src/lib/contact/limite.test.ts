import { describe, expect, it } from "vitest";
import { Limiteur, reseau } from "./limite";

const T0 = Date.UTC(2026, 9, 15, 12, 0);
const MINUTE = 60_000;

describe("Limiteur", () => {
  it("bloque au-delà du maximum puis libère après la fenêtre", () => {
    const limiteur = new Limiteur(2, 60 * MINUTE);
    limiteur.noter("203.0.113.7", T0);
    expect(limiteur.autorise("203.0.113.7", T0 + MINUTE)).toBe(true);
    limiteur.noter("203.0.113.7", T0 + MINUTE);
    expect(limiteur.autorise("203.0.113.7", T0 + 2 * MINUTE)).toBe(false);
    expect(limiteur.autorise("203.0.113.8", T0 + 2 * MINUTE)).toBe(true);
    expect(limiteur.autorise("203.0.113.7", T0 + 60 * MINUTE + 1)).toBe(true);
  });

  it("compte ensemble les adresses IPv6 d'un même /64", () => {
    const limiteur = new Limiteur(1, 60 * MINUTE);
    limiteur.noter("2001:db8:1:2::1", T0);
    expect(limiteur.autorise("2001:db8:1:2:ffff::9", T0)).toBe(false);
    expect(limiteur.autorise("2001:db8:1:3::1", T0)).toBe(true);
  });

  it("ne garde aucune adresse en clair", () => {
    const limiteur = new Limiteur();
    limiteur.noter("203.0.113.7", T0);
    const { envois } = limiteur as unknown as { envois: Map<string, number[]> };
    expect([...envois.keys()]).toHaveLength(1);
    expect([...envois.keys()].join()).not.toContain("203.0.113");
  });
});

describe("reseau", () => {
  it("réduit une adresse IPv6 à son /64", () => {
    expect(reseau("2001:0db8:0001:0002:0000:0000:0000:0001")).toBe("2001:db8:1:2::/64");
    expect(reseau("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(reseau("::1")).toBe("0:0:0:0::/64");
  });

  it("laisse une adresse IPv4 ou illisible telle quelle", () => {
    expect(reseau("203.0.113.7")).toBe("203.0.113.7");
    expect(reseau("zz::1")).toBe("zz::1");
  });
});
