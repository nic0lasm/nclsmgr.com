import { describe, expect, it } from "vitest";
import { empreinte, estIdLien, estSecretBienForme, genererIdLien, genererSecret } from "./jetons";

describe("genererSecret", () => {
  it("produit 256 bits en base64url, différents à chaque appel", () => {
    const secret = genererSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(secret, "base64url")).toHaveLength(32);
    const tirages = new Set(Array.from({ length: 1000 }, genererSecret));
    expect(tirages.size).toBe(1000);
  });
});

describe("estSecretBienForme", () => {
  it("n'accepte que 43 caractères base64url", () => {
    expect(estSecretBienForme(genererSecret())).toBe(true);
    expect(estSecretBienForme("a".repeat(42))).toBe(false);
    expect(estSecretBienForme("a".repeat(44))).toBe(false);
    expect(estSecretBienForme(`${"a".repeat(42)}=`)).toBe(false);
    expect(estSecretBienForme(`${"a".repeat(42)}+`)).toBe(false);
    expect(estSecretBienForme(`${"a".repeat(42)}\n`)).toBe(false);
    expect(estSecretBienForme(undefined)).toBe(false);
    expect(estSecretBienForme(42)).toBe(false);
  });
});

describe("empreinte", () => {
  it("est le SHA-256 du secret", () => {
    expect(empreinte("abc").toString("hex")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(empreinte(genererSecret())).toHaveLength(32);
  });
});

describe("genererIdLien", () => {
  it("produit un identifiant court sans caractère ambigu", () => {
    for (let i = 0; i < 200; i++) {
      const id = genererIdLien();
      expect(estIdLien(id)).toBe(true);
      expect(id.slice(2)).not.toMatch(/[01ilo]/);
    }
    expect(estIdLien("l-7kq2mz")).toBe(true);
    expect(estIdLien("l-7kq2m")).toBe(false);
    expect(estIdLien("l-7KQ2MZ")).toBe(false);
  });
});
