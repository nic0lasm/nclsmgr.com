import { describe, expect, it, vi } from "vitest";
import {
  actualiserInstantane,
  depotsAutomatiques,
  lireDepot,
  lireInstantane,
  lireReponse,
  recupererDepots,
  type Depot,
} from "./github";

function brut(nom: string, champs: Record<string, unknown> = {}) {
  return {
    name: nom,
    full_name: `nic0lasm/${nom}`,
    html_url: `https://github.com/nic0lasm/${nom}`,
    private: false,
    fork: false,
    archived: false,
    description: "Un dépôt",
    homepage: null,
    language: "TypeScript",
    topics: ["nextjs"],
    stargazers_count: 3,
    forks_count: 1,
    pushed_at: "2026-10-15T12:00:00Z",
    license: { spdx_id: "MIT" },
    owner: { avatar_url: "https://avatars.githubusercontent.com/u/1" },
    ...champs,
  };
}

describe("lireDepot", () => {
  it("ne garde que les champs affichés", () => {
    const depot = lireDepot(brut("site"));
    expect(depot).toEqual({
      nom: "site",
      depot: "nic0lasm/site",
      description: "Un dépôt",
      url: "https://github.com/nic0lasm/site",
      siteWeb: null,
      langage: "TypeScript",
      topics: ["nextjs"],
      etoiles: 3,
      forks: 1,
      actifLe: "2026-10-15T12:00:00Z",
      licence: "MIT",
      fork: false,
      archive: false,
    });
  });

  it("écarte un dépôt privé ou d'un autre compte", () => {
    expect(lireDepot(brut("secret", { private: true }))).toBeNull();
    expect(lireDepot(brut("x", { html_url: "https://github.com/autre/x" }))).toBeNull();
    expect(lireDepot(brut("x", { full_name: "autre/x" }))).toBeNull();
    expect(lireDepot(brut("x", { html_url: "https://exemple.test/nic0lasm/x" }))).toBeNull();
  });

  it("écarte une entrée incomplète", () => {
    expect(lireDepot(null)).toBeNull();
    expect(lireDepot(brut("x", { pushed_at: "pas une date" }))).toBeNull();
    expect(lireDepot(brut("x", { name: "" }))).toBeNull();
  });

  it("n'accepte qu'un site web en https", () => {
    expect(lireDepot(brut("a", { homepage: "javascript:alert(1)" }))?.siteWeb).toBeNull();
    expect(lireDepot(brut("a", { homepage: "http://exemple.test" }))?.siteWeb).toBeNull();
    expect(lireDepot(brut("a", { homepage: "https://exemple.test" }))?.siteWeb).toBe(
      "https://exemple.test/",
    );
  });

  it("limite et nettoie les topics", () => {
    const topics = ["a", "b", "c", "d", "e", "f", "<script>", 3];
    expect(lireDepot(brut("a", { topics }))?.topics).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("ignore une licence non identifiée", () => {
    expect(lireDepot(brut("a", { license: { spdx_id: "NOASSERTION" } }))?.licence).toBeNull();
    expect(lireDepot(brut("a", { license: null }))?.licence).toBeNull();
  });
});

describe("lireReponse", () => {
  it("refuse une réponse qui n'est pas une liste", () => {
    expect(() => lireReponse({ message: "Bad credentials" })).toThrow();
  });

  it("trie par dernière activité", () => {
    const depots = lireReponse([
      brut("ancien", { pushed_at: "2026-01-01T00:00:00Z" }),
      brut("recent", { pushed_at: "2026-10-01T00:00:00Z" }),
    ]);
    expect(depots.map((d) => d.nom)).toEqual(["recent", "ancien"]);
  });
});

describe("depotsAutomatiques", () => {
  const depots = lireReponse([
    brut("phare"),
    brut("fourche", { fork: true }),
    brut("vieux", { archived: true }),
    brut("client"),
    brut("outil"),
  ]);

  it("retire forks, archives, exclus et projets mis en avant", () => {
    const liste = depotsAutomatiques(depots, {
      exclus: ["nic0lasm/client"],
      misEnAvant: ["nic0lasm/phare"],
    });
    expect(liste.map((d) => d.nom)).toEqual(["outil"]);
  });
});

describe("recupererDepots", () => {
  it("appelle l'API avec le jeton s'il est fourni", async () => {
    const fetchFn = vi.fn(async () => Response.json([brut("site")]));
    const depots = await recupererDepots(fetchFn as unknown as typeof fetch, "jeton");
    expect(depots).toHaveLength(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/users/nic0lasm/repos");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jeton");
  });

  it("n'envoie pas d'en-tête d'autorisation sans jeton", async () => {
    const fetchFn = vi.fn(async () => Response.json([]));
    await recupererDepots(fetchFn as unknown as typeof fetch);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("échoue sur une erreur HTTP", async () => {
    const fetchFn = vi.fn(async () => new Response("limite atteinte", { status: 403 }));
    await expect(recupererDepots(fetchFn as unknown as typeof fetch)).rejects.toThrow("403");
  });
});

describe("actualiserInstantane", () => {
  const precedent = { genereLe: "2026-10-01T00:00:00.000Z", depots: [] as Depot[] };
  const maintenant = () => new Date("2026-10-15T04:17:00Z");

  it("produit un nouvel instantané quand l'API répond", async () => {
    const resultat = await actualiserInstantane({
      recuperer: async () => lireReponse([brut("site")]),
      precedent,
      strict: false,
      maintenant,
    });
    expect(resultat.source).toBe("api");
    expect(resultat.instantane.genereLe).toBe("2026-10-15T04:17:00.000Z");
    expect(resultat.instantane.depots).toHaveLength(1);
  });

  it("garde l'instantané précédent si l'API échoue", async () => {
    const resultat = await actualiserInstantane({
      recuperer: async () => {
        throw new Error("réseau");
      },
      precedent,
      strict: false,
    });
    expect(resultat).toEqual({ instantane: precedent, source: "repli" });
  });

  it("échoue en mode strict, ou sans instantané précédent", async () => {
    const recuperer = async () => {
      throw new Error("réseau");
    };
    await expect(actualiserInstantane({ recuperer, precedent, strict: true })).rejects.toThrow();
    await expect(
      actualiserInstantane({ recuperer, precedent: null, strict: false }),
    ).rejects.toThrow();
  });
});

describe("lireInstantane", () => {
  it("écarte une entrée dont l'adresse sort du compte", () => {
    const instantane = lireInstantane({
      genereLe: "2026-10-15T00:00:00Z",
      depots: [
        { depot: "nic0lasm/a", url: "https://github.com/nic0lasm/a" },
        { depot: "x/b", url: "https://exemple.test/b" },
      ],
    });
    expect(instantane?.depots).toHaveLength(1);
  });

  it("refuse un fichier mal formé", () => {
    expect(lireInstantane(null)).toBeNull();
    expect(lireInstantane({ depots: [] })).toBeNull();
  });
});
