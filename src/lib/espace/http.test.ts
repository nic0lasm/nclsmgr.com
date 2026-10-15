import { describe, expect, it } from "vitest";
import {
  attendreAuMoins,
  cookieEfface,
  cookieSession,
  lireCorpsJson,
  origineAutorisee,
  TAILLE_MAX_CORPS,
} from "./http";

describe("origineAutorisee", () => {
  const verifier = (enTetes: Record<string, string>) => origineAutorisee(new Headers(enTetes));

  it("accepte Sec-Fetch-Site: same-origin et refuse toute autre valeur", () => {
    expect(verifier({ "sec-fetch-site": "same-origin" })).toBe(true);
    for (const site of ["same-site", "cross-site", "none", ""]) {
      expect(
        verifier({ "sec-fetch-site": site, origin: "https://nclsmgr.com", host: "nclsmgr.com" }),
      ).toBe(false);
    }
  });

  it("à défaut, exige un Origin dont l'hôte égale Host", () => {
    expect(verifier({ origin: "https://nclsmgr.com", host: "nclsmgr.com" })).toBe(true);
    expect(verifier({ origin: "http://127.0.0.1:3100", host: "127.0.0.1:3100" })).toBe(true);
    expect(verifier({ origin: "https://nclsmgr.com", host: "NCLSMGR.com" })).toBe(true);
    expect(verifier({ origin: "https://evil.example", host: "nclsmgr.com" })).toBe(false);
    expect(verifier({ origin: "https://nclsmgr.com.evil.example", host: "nclsmgr.com" })).toBe(
      false,
    );
    expect(verifier({ origin: "https://nclsmgr.com:8443", host: "nclsmgr.com" })).toBe(false);
    expect(verifier({ origin: "null", host: "nclsmgr.com" })).toBe(false);
    expect(verifier({ origin: "https://nclsmgr.com" })).toBe(false);
    expect(verifier({ host: "nclsmgr.com" })).toBe(false);
    expect(verifier({})).toBe(false);
  });
});

describe("cookies", () => {
  it("pose un cookie __Host- HttpOnly, Secure, SameSite=Lax, valable jusqu'à la fin de la session", () => {
    const valeur = "a".repeat(43);
    const cookie = cookieSession(valeur, 1_000_000 + 30 * 86_400_000, 1_000_000);
    expect(cookie).toBe(
      `__Host-espace=${valeur}; Max-Age=2592000; Path=/; Secure; HttpOnly; SameSite=Lax`,
    );
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("arrondit Max-Age vers le bas et ne le rend jamais négatif", () => {
    expect(cookieSession("x", 2_999, 1_000)).toContain("Max-Age=1;");
    expect(cookieSession("x", 0, 1_000)).toContain("Max-Age=0;");
  });

  it("efface le cookie avec les mêmes attributs", () => {
    expect(cookieEfface()).toBe(
      "__Host-espace=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax",
    );
  });
});

describe("lireCorpsJson", () => {
  const requete = (corps: BodyInit | null, type = "application/json") =>
    new Request("http://localhost/fr/p/acces", {
      method: "POST",
      headers: type ? { "content-type": type } : {},
      body: corps,
    });

  it("lit un objet JSON", async () => {
    expect(await lireCorpsJson(requete('{"jeton":"abc"}'))).toEqual({ jeton: "abc" });
    expect(
      await lireCorpsJson(requete('{"jeton":"abc"}', "application/json; charset=utf-8")),
    ).toEqual({ jeton: "abc" });
  });

  it("refuse un autre type, un corps vide, illisible ou de plus de 1 Kio", async () => {
    expect(await lireCorpsJson(requete('{"jeton":"abc"}', "text/plain"))).toBeUndefined();
    expect(await lireCorpsJson(requete('{"jeton":"abc"}', ""))).toBeUndefined();
    expect(await lireCorpsJson(requete(null))).toBeUndefined();
    expect(await lireCorpsJson(requete("{jeton"))).toBeUndefined();
    expect(await lireCorpsJson(requete(new Uint8Array([0x7b, 0xff, 0x7d])))).toBeUndefined();
    const long = JSON.stringify({ jeton: "a".repeat(TAILLE_MAX_CORPS) });
    expect(await lireCorpsJson(requete(long))).toBeUndefined();
    const juste = JSON.stringify({ j: "a".repeat(TAILLE_MAX_CORPS - 8) });
    expect(juste.length).toBe(TAILLE_MAX_CORPS);
    expect(await lireCorpsJson(requete(juste))).toEqual({ j: "a".repeat(TAILLE_MAX_CORPS - 8) });
  });

  it("refuse un corps trop long même sans Content-Length", async () => {
    const flux = new ReadableStream<Uint8Array>({
      start(controleur) {
        for (let i = 0; i < 4; i++) controleur.enqueue(new Uint8Array(400).fill(0x20));
        controleur.close();
      },
    });
    const req = new Request("http://localhost/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: flux,
      duplex: "half",
    } as RequestInit);
    expect(req.headers.get("content-length")).toBeNull();
    expect(await lireCorpsJson(req)).toBeUndefined();
  });
});

describe("attendreAuMoins", () => {
  it("attend jusqu'au plancher", async () => {
    const debut = performance.now();
    await attendreAuMoins(debut, 50);
    expect(performance.now() - debut).toBeGreaterThanOrEqual(49);
  });
});
