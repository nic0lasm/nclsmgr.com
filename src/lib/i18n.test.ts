import { describe, expect, it } from "vitest";
import { negotiateLocale } from "./i18n";

describe("negotiateLocale", () => {
  it("retient le français par défaut", () => {
    expect(negotiateLocale(null)).toBe("fr");
    expect(negotiateLocale("de-DE,de;q=0.9")).toBe("fr");
  });

  it("respecte l'ordre de préférence", () => {
    expect(negotiateLocale("en-GB,en;q=0.9,fr;q=0.8")).toBe("en");
    expect(negotiateLocale("de;q=1,fr;q=0.5,en;q=0.7")).toBe("en");
    expect(negotiateLocale("fr-CA")).toBe("fr");
  });
});
