import { describe, expect, it } from "vitest";
import { isTheme, otherTheme, resolveTheme, themeInitScript } from "@/lib/theme";

function runInitScript(stored: string | null, throws = false) {
  const root = { dataset: {} as Record<string, string> };
  const localStorage = {
    getItem: () => {
      if (throws) throw new Error("stockage bloqué");
      return stored;
    },
  };
  new Function("localStorage", "document", themeInitScript)(localStorage, {
    documentElement: root,
  });
  return root.dataset.theme;
}

describe("thème", () => {
  it("reconnaît uniquement les thèmes connus", () => {
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("sepia")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it("préfère le choix enregistré au réglage du système", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("suit le système sans choix valide", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme("n'importe quoi", false)).toBe("light");
  });

  it("bascule vers l'autre thème", () => {
    expect(otherTheme("light")).toBe("dark");
    expect(otherTheme("dark")).toBe("light");
  });

  it("le script initial applique seulement une valeur valide", () => {
    expect(runInitScript("dark")).toBe("dark");
    expect(runInitScript("<script>")).toBeUndefined();
    expect(runInitScript(null)).toBeUndefined();
  });

  it("le script initial résiste à un stockage bloqué", () => {
    expect(runInitScript(null, true)).toBeUndefined();
  });
});
