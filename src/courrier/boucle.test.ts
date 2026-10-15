import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ouvrirBase, type Base } from "@/lib/espace/base";
import { mettreEnFile, reserver, type MessageCourriel } from "@/lib/espace/courriels";
import { migrer } from "@/lib/espace/migrations";
import { traiterFile } from "./boucle";

const T0 = Date.UTC(2026, 9, 15, 12, 0);
const alerte = (refus: number) => ({ refus, depuis: T0, jusqua: T0 });

let db: Base;

function etat() {
  return db.prepare("SELECT id, envoye_le, essais, abandonne_le FROM courriels ORDER BY id").all();
}

beforeEach(() => {
  db = ouvrirBase(":memory:");
  migrer(db);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe("traiterFile", () => {
  it("envoie dans l'ordre et marque chaque courriel envoyé", async () => {
    mettreEnFile(db, "alerte", alerte(1), T0);
    mettreEnFile(db, "alerte", alerte(2), T0);
    const envoyes: MessageCourriel[] = [];
    const bilan = await traiterFile(
      db,
      async (m) => void envoyes.push(m),
      () => T0,
    );
    expect(bilan).toEqual({ envoyes: 2, echecs: 0 });
    expect(envoyes.map((m) => m.texte.split(" ")[0])).toEqual(["1", "2"]);
    expect(etat()).toEqual([
      { id: 1, envoye_le: T0, essais: 0, abandonne_le: null },
      { id: 2, envoye_le: T0, essais: 0, abandonne_le: null },
    ]);
  });

  it("s'arrête au premier échec d'envoi et retentera plus tard", async () => {
    mettreEnFile(db, "alerte", alerte(1), T0);
    mettreEnFile(db, "alerte", alerte(2), T0);
    const envoyer = vi.fn().mockRejectedValue(Object.assign(new Error("refus"), { code: "EAUTH" }));
    expect(await traiterFile(db, envoyer, () => T0)).toEqual({ envoyes: 0, echecs: 1 });
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(etat()).toEqual([
      { id: 1, envoye_le: null, essais: 1, abandonne_le: null },
      { id: 2, envoye_le: null, essais: 0, abandonne_le: null },
    ]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("EAUTH"));
  });

  it("abandonne un courriel illisible sans bloquer les suivants", async () => {
    db.prepare("INSERT INTO courriels (modele, donnees, cree_le) VALUES ('alerte', '{}', ?)").run(
      T0,
    );
    mettreEnFile(db, "alerte", alerte(2), T0);
    const envoyer = vi.fn().mockResolvedValue(undefined);
    expect(await traiterFile(db, envoyer, () => T0)).toEqual({ envoyes: 1, echecs: 1 });
    expect(etat()).toEqual([
      { id: 1, envoye_le: null, essais: 0, abandonne_le: T0 },
      { id: 2, envoye_le: T0, essais: 0, abandonne_le: null },
    ]);
  });

  it("laisse un courriel réservé ailleurs entre-temps", async () => {
    mettreEnFile(db, "alerte", alerte(1), T0);
    const autre = mettreEnFile(db, "alerte", alerte(2), T0);
    // Pendant le premier envoi, une autre instance prend le second courriel.
    const envoyer = vi.fn(async () => void reserver(db, autre, T0));
    expect(await traiterFile(db, envoyer, () => T0)).toEqual({ envoyes: 1, echecs: 0 });
    expect(envoyer).toHaveBeenCalledTimes(1);
  });

  it("s'arrête entre deux envois quand le service doit s'éteindre", async () => {
    mettreEnFile(db, "alerte", alerte(1), T0);
    mettreEnFile(db, "alerte", alerte(2), T0);
    let arret = false;
    const envoyer = vi.fn(async () => {
      arret = true;
    });
    expect(
      await traiterFile(
        db,
        envoyer,
        () => T0,
        () => !arret,
      ),
    ).toEqual({
      envoyes: 1,
      echecs: 0,
    });
    expect(envoyer).toHaveBeenCalledTimes(1);
  });
});
