import { describe, expect, it } from "vitest";
import { cleIp, LimiteurDebit, SANS_IP } from "./debit";

const MINUTE = 60_000;

describe("LimiteurDebit", () => {
  it("accepte 10 requêtes en 10 minutes puis refuse avec un délai d'attente", () => {
    const limiteur = new LimiteurDebit(10, 10 * MINUTE);
    for (let i = 0; i < 10; i++) expect(limiteur.consommer("a", i * 1000).autorise).toBe(true);
    expect(limiteur.consommer("a", 30_000)).toEqual({ autorise: false, reessayerDans: 570 });
    // Une autre clé garde son propre compteur.
    expect(limiteur.consommer("b", 30_000).autorise).toBe(true);
  });

  it("rouvre la clé quand la fenêtre est échue", () => {
    const limiteur = new LimiteurDebit(2, MINUTE);
    limiteur.consommer("a", 0);
    limiteur.consommer("a", 1);
    expect(limiteur.consommer("a", MINUTE - 1)).toEqual({ autorise: false, reessayerDans: 1 });
    expect(limiteur.consommer("a", MINUTE).autorise).toBe(true);
  });

  it("annonce au moins une seconde d'attente", () => {
    const limiteur = new LimiteurDebit(1, 1000);
    limiteur.consommer("a", 0);
    expect(limiteur.consommer("a", 999)).toEqual({ autorise: false, reessayerDans: 1 });
  });

  it("borne le nombre de clés suivies en purgeant les fenêtres échues, les plus anciennes d'abord", () => {
    const limiteur = new LimiteurDebit(1, MINUTE, 3);
    limiteur.consommer("a", 0);
    limiteur.consommer("b", MINUTE / 2);
    limiteur.consommer("c", MINUTE / 2);
    // « a » est échue : elle seule part.
    limiteur.consommer("d", MINUTE);
    expect(limiteur.taille).toBe(3);
    expect(limiteur.consommer("b", MINUTE).autorise).toBe(false);
    expect(limiteur.consommer("c", MINUTE).autorise).toBe(false);
  });

  it("table pleine : n'évince aucune clé ouverte et compte les nouveaux venus ensemble", () => {
    const limiteur = new LimiteurDebit(2, MINUTE, 3);
    for (const cle of ["a", "b", "c"]) limiteur.consommer(cle, 0);
    limiteur.consommer("a", 1);
    expect(limiteur.consommer("a", 2).autorise).toBe(false);
    // Deux nouveaux venus remplissent le compartiment de débordement, le troisième est refusé.
    expect(limiteur.consommer("x", 10).autorise).toBe(true);
    expect(limiteur.consommer("y", 10).autorise).toBe(true);
    expect(limiteur.consommer("z", 10)).toEqual({ autorise: false, reessayerDans: 60 });
    expect(limiteur.taille).toBe(3);
    // « a » reste bloquée.
    expect(limiteur.consommer("a", 20).autorise).toBe(false);
    // Fenêtres échues : les places se libèrent.
    expect(limiteur.consommer("z", MINUTE + 10).autorise).toBe(true);
    expect(limiteur.consommer("a", MINUTE + 10).autorise).toBe(true);
  });

  it("une IP bloquée le reste malgré un flot de 10 050 autres adresses", () => {
    const limiteur = new LimiteurDebit(10, 10 * MINUTE);
    for (let i = 0; i < 10; i++) limiteur.consommer("bloquee", i);
    expect(limiteur.consommer("bloquee", 10).autorise).toBe(false);
    for (let i = 0; i < 10_050; i++) limiteur.consommer(`2001:db8:${i}::/64`, 100 + i);
    expect(limiteur.taille).toBe(10_000);
    expect(limiteur.consommer("bloquee", 20_000).autorise).toBe(false);
  });

  it("tient 10 000 clés au plus par défaut", () => {
    const limiteur = new LimiteurDebit(10, 10 * MINUTE);
    for (let i = 0; i < 12_000; i++) limiteur.consommer(`ip-${i}`, i);
    expect(limiteur.taille).toBe(10_000);
  });
});

describe("cleIp", () => {
  it("garde une IPv4 telle quelle", () => {
    expect(cleIp("203.0.113.7")).toBe("203.0.113.7");
    expect(cleIp(" 203.0.113.7 ")).toBe("203.0.113.7");
  });

  it("regroupe les IPv6 par bloc /64", () => {
    const cle = cleIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    expect(cle).toBe("2001:db8:1:2::/64");
    expect(cleIp("2001:db8:1:2::1")).toBe(cle);
    expect(cleIp("2001:0DB8:0001:0002:0:0:0:ffff")).toBe(cle);
    expect(cleIp("2001:db8:1:3::1")).not.toBe(cle);
    expect(cleIp("::1")).toBe("0:0:0:0::/64");
    expect(cleIp("2001:db8::")).toBe("2001:db8:0:0::/64");
    expect(cleIp("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("ramène une IPv4 encapsulée en IPv6 à l'IPv4", () => {
    expect(cleIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(cleIp("::ffff:cb00:7107")).toBe("203.0.113.7");
  });

  it("met les en-têtes absents ou illisibles dans un seul compartiment", () => {
    expect(cleIp(null)).toBe(SANS_IP);
    expect(cleIp("")).toBe(SANS_IP);
    expect(cleIp("pas une ip")).toBe(SANS_IP);
    expect(cleIp("203.0.113.7, 198.51.100.1")).toBe(SANS_IP);
    expect(cleIp("[2001:db8::1]:443")).toBe(SANS_IP);
  });
});
