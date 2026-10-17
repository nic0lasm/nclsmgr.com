import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { CHEMIN_DOCUMENTS, EN_TETES_DOCUMENT } from "@/lib/espace/en-tetes";
import { proxy } from "./proxy";

const CSP_DOCUMENT = EN_TETES_DOCUMENT["Content-Security-Policy"];

function passer(chemin: string, enTetes: Record<string, string> = {}) {
  return proxy(new NextRequest(`http://127.0.0.1${chemin}`, { headers: enTetes }));
}

// En-têtes de requête transmis à l'application : Next les lit dans x-middleware-override-headers
// (liste des noms gardés) et x-middleware-request-<nom> (valeurs).
function enTetesTransmis(reponse: Response): Record<string, string | null> {
  const noms = reponse.headers.get("x-middleware-override-headers")?.split(",") ?? [];
  return Object.fromEntries(
    noms.map((nom) => [nom, reponse.headers.get(`x-middleware-request-${nom}`)]),
  );
}

describe("proxy : portée du filtre des documents", () => {
  it.each([
    "/fr/espace/documents",
    "/fr/espace/documents/",
    "/fr/espace/documents/cv",
    "/en/espace/documents/cv",
    "/fr/espace/documents/cv/autre",
  ])("politique fermée, sans nonce, sur %s", (chemin) => {
    expect(CHEMIN_DOCUMENTS.test(chemin)).toBe(true);
    const reponse = passer(chemin);
    expect(reponse.headers.get("content-security-policy")).toBe(CSP_DOCUMENT);
    expect(enTetesTransmis(reponse)["x-nonce"]).toBeUndefined();
  });

  it.each([
    "/fr/espace",
    "/en/espace",
    "/fr/espace/documentsX",
    "/fr/espace/documents-cv",
    "/fr/espace/Documents/cv",
    "/fr/espace/autre/documents/cv",
    "/fr/documents/cv",
    "/fr/p",
  ])("politique à nonce sur %s", (chemin) => {
    expect(CHEMIN_DOCUMENTS.test(chemin)).toBe(false);
    const reponse = passer(chemin);
    const csp = reponse.headers.get("content-security-policy") ?? "";
    const nonce = enTetesTransmis(reponse)["x-nonce"];
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(csp).toContain(`'nonce-${nonce}'`);
  });

  it("une langue inconnue est redirigée, sans politique de documents", () => {
    const reponse = passer("/de/espace/documents/cv");
    expect(reponse.status).toBe(307);
    expect(new URL(reponse.headers.get("location") ?? "").pathname).toBe(
      "/fr/de/espace/documents/cv",
    );
    expect(reponse.headers.get("content-security-policy")).toBeNull();
  });

  it("retire x-nonce et les politiques envoyés par le client sur les documents", () => {
    const reponse = passer("/fr/espace/documents/cv", {
      "X-Nonce": "nonce-du-client",
      "Content-Security-Policy": "script-src *",
      "Content-Security-Policy-Report-Only": "script-src 'nonce-du-client'",
      "User-Agent": "test",
    });
    const transmis = enTetesTransmis(reponse);
    expect(transmis["user-agent"]).toBe("test");
    expect(transmis).not.toHaveProperty("x-nonce");
    expect(transmis).not.toHaveProperty("content-security-policy");
    expect(transmis).not.toHaveProperty("content-security-policy-report-only");
    expect(reponse.headers.get("content-security-policy")).toBe(CSP_DOCUMENT);
  });

  it("remplace x-nonce envoyé par le client ailleurs", () => {
    const reponse = passer("/fr/espace", { "X-Nonce": "nonce-du-client" });
    expect(enTetesTransmis(reponse)["x-nonce"]).not.toBe("nonce-du-client");
  });
});
