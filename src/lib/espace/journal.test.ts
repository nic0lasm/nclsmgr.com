import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ouvrirBase, type Base } from "./base";
import { rediger } from "./courriels";
import {
  CompteurRefus,
  contexteDepuis,
  DOUBLON_DOCUMENT,
  MAX_LIGNES_PAR_JOUR,
  navigateurDepuis,
  noterDocument,
  noterEssaiRefuse,
  noterOuverture,
  noterRefus,
  paysDepuis,
  SEUIL_ALERTE,
  type ContexteVisite,
} from "./journal";
import { creerLien, JOUR, revoquerLien, type Lien } from "./liens";
import { migrer } from "./migrations";

const T0 = Date.UTC(2026, 9, 15, 12, 0);
const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const ici: ContexteVisite = { pays: "FR", navigateur: "Firefox · Windows" };
const nouveau = {
  profil: "recruteur",
  langue: "fr",
  destinataire: "Camille Durand",
  organisation: "Acme",
} as const;

let db: Base;

function consultations(lienId: string) {
  return db
    .prepare(
      "SELECT type, document, le, pays, navigateur FROM consultations WHERE lien_id = ? ORDER BY id",
    )
    .all(lienId);
}

function courriels(modele: string) {
  return (
    db
      .prepare("SELECT donnees, cree_le FROM courriels WHERE modele = ? ORDER BY id")
      .all(modele) as { donnees: string; cree_le: number }[]
  ).map((c) => ({ ...JSON.parse(c.donnees), creeLe: c.cree_le }));
}

function ouvertLe(id: string) {
  return (db.prepare("SELECT ouvert_le FROM liens WHERE id = ?").get(id) as { ouvert_le: number })
    .ouvert_le;
}

beforeEach(() => {
  db = ouvrirBase(":memory:");
  migrer(db);
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe("paysDepuis", () => {
  it("ne garde que deux lettres majuscules, hors XX et T1", () => {
    expect(paysDepuis("FR")).toBe("FR");
    expect(paysDepuis(" DE ")).toBe("DE");
    for (const valeur of [null, "", "XX", "T1", "fr", "FRA", "F", "F1", "É1", "F R"]) {
      expect(paysDepuis(valeur), String(valeur)).toBeNull();
    }
  });
});

describe("navigateurDepuis", () => {
  const cas: [string, string][] = [
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
      "Firefox · Windows",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Safari · iOS",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
      "Chrome · Android",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      "Safari · macOS",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      "Edge · Windows",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/114.0.0.0",
      "Opera · Windows",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
      "Samsung Internet · Android",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1",
      "Chrome · iOS",
    ],
    [
      "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15",
      "Firefox · iOS",
    ],
    [
      "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Chrome · ChromeOS",
    ],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox · Linux"],
    ["curl/8.9.1", "Autre"],
    ["", "Autre"],
  ];
  it.each(cas)("%s", (userAgent, attendu) => {
    expect(navigateurDepuis(userAgent)).toBe(attendu);
  });

  it("ne recopie jamais rien de la chaîne reçue", () => {
    const valeurs = new Set<string>();
    for (const ua of [
      null,
      "Firefox/<script>",
      "Mozilla/5.0 (Windows) Chrome/1 Camille Durand Acme",
      `${"a".repeat(10_000)} Firefox/1`,
      "Edg/\r\nBcc: x@example.com",
    ]) {
      valeurs.add(navigateurDepuis(ua));
    }
    for (const valeur of valeurs) {
      expect(valeur).toMatch(
        /^(?:Autre|(?:Edge|Opera|Samsung Internet|Firefox|Chrome|Safari|Autre) · (?:iOS|Android|Windows|ChromeOS|macOS|Linux|Autre))$/,
      );
    }
  });

  it("reste court : une chaîne géante n'est pas lue au-delà de 512 caractères", () => {
    expect(navigateurDepuis(`${" ".repeat(600)}Firefox/131.0`)).toBe("Autre");
  });
});

describe("contexteDepuis", () => {
  it("ne garde que le pays et la famille de navigateur", () => {
    const enTetes = new Headers({
      "CF-IPCountry": "BE",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/131.0",
      "X-Client-IP": "203.0.113.7",
    });
    expect(contexteDepuis(enTetes)).toEqual({ pays: "BE", navigateur: "Firefox · Windows" });
  });
});

describe("noterOuverture", () => {
  it("note chaque ouverture, pose ouvert_le et notifie à la première seulement", () => {
    const { lien } = creerLien(db, nouveau, T0);
    expect(noterOuverture(db, lien, ici, T0 + MINUTE)).toEqual({ premiere: true });
    expect(noterOuverture(db, lien, { pays: null, navigateur: "Autre" }, T0 + 2 * MINUTE)).toEqual({
      premiere: false,
    });
    expect(ouvertLe(lien.id)).toBe(T0 + MINUTE);
    expect(consultations(lien.id)).toEqual([
      {
        type: "ouverture",
        document: null,
        le: T0 + MINUTE,
        pays: "FR",
        navigateur: "Firefox · Windows",
      },
      { type: "ouverture", document: null, le: T0 + 2 * MINUTE, pays: null, navigateur: "Autre" },
    ]);
    expect(courriels("ouverture")).toEqual([
      {
        lienId: lien.id,
        destinataire: "Camille Durand",
        organisation: "Acme",
        le: T0 + MINUTE,
        pays: "FR",
        navigateur: "Firefox · Windows",
        creeLe: T0 + MINUTE,
      },
    ]);
  });

  it("se fie à la base : un lien lu avant une première ouverture concurrente ne notifie pas deux fois", () => {
    const { lien } = creerLien(db, nouveau, T0);
    const copie: Lien = { ...lien };
    noterOuverture(db, lien, ici, T0 + 1);
    expect(noterOuverture(db, copie, ici, T0 + 2).premiere).toBe(false);
    expect(courriels("ouverture")).toHaveLength(1);
  });

  it("le courriel rédigé n'a pas le nom du destinataire dans son objet", () => {
    const { lien } = creerLien(db, nouveau, T0);
    noterOuverture(db, lien, ici, T0);
    const [donnees] = courriels("ouverture");
    const message = rediger("ouverture", donnees);
    expect(message.sujet).toBe("Espace privé : lien ouvert");
    expect(message.texte).toContain("Navigateur : Firefox · Windows");
    expect(message.texte).toContain("Pays : FR");
  });

  it("garde la ligne du journal quand le valideur des courriels refuse les données", () => {
    // Le ligature « ﬀ » double de longueur à la normalisation NFKC : 120 caractères en font 121.
    const { lien } = creerLien(db, { ...nouveau, destinataire: `${"a".repeat(119)}\u{FB00}` }, T0);
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(noterOuverture(db, lien, ici, T0).premiere).toBe(true);
    expect(consultations(lien.id)).toHaveLength(1);
    expect(ouvertLe(lien.id)).toBe(T0);
    expect(courriels("ouverture")).toEqual([]);
    expect(erreur).toHaveBeenCalledTimes(1);
    expect(String(erreur.mock.calls[0])).not.toContain("aaaa");
  });

  it("borne le journal à MAX_LIGNES_PAR_JOUR ouvertures par lien sur 24 heures", () => {
    const { lien } = creerLien(db, nouveau, T0);
    for (let i = 0; i < MAX_LIGNES_PAR_JOUR + 10; i++) noterOuverture(db, lien, ici, T0 + i);
    expect(consultations(lien.id)).toHaveLength(MAX_LIGNES_PAR_JOUR);
    noterOuverture(db, lien, ici, T0 + JOUR + 1);
    expect(consultations(lien.id)).toHaveLength(MAX_LIGNES_PAR_JOUR + 1);
  });
});

describe("noterEssaiRefuse", () => {
  it("note chaque essai sur un lien révoqué et notifie au plus une fois par 24 heures", () => {
    const { lien } = creerLien(db, nouveau, T0);
    revoquerLien(db, lien.id, T0 + HEURE);
    const revoque: Lien = { ...lien, revoqueLe: T0 + HEURE };

    expect(noterEssaiRefuse(db, revoque, ici, T0 + 2 * HEURE)).toEqual({ notifie: true });
    expect(noterEssaiRefuse(db, revoque, ici, T0 + 3 * HEURE)).toEqual({ notifie: false });
    expect(noterEssaiRefuse(db, revoque, ici, T0 + 2 * HEURE + JOUR - 1)).toEqual({
      notifie: false,
    });
    expect(noterEssaiRefuse(db, revoque, ici, T0 + 2 * HEURE + JOUR)).toEqual({ notifie: true });

    expect(consultations(lien.id).map((c) => (c as { type: string }).type)).toEqual(
      Array(4).fill("essai_refuse"),
    );
    expect(courriels("essai_refuse")).toEqual([
      {
        lienId: lien.id,
        destinataire: "Camille Durand",
        organisation: "Acme",
        motif: "revoque",
        finLe: T0 + HEURE,
        le: T0 + 2 * HEURE,
        creeLe: T0 + 2 * HEURE,
      },
      expect.objectContaining({ le: T0 + 2 * HEURE + JOUR }),
    ]);
  });

  it("des essais toutes les 23 heures notifient quand même une fois par jour", () => {
    const { lien } = creerLien(db, { ...nouveau, dureeJours: 1 }, T0);
    const expire: Lien = { ...lien };
    const notifies = [1, 2, 3, 4].map(
      (i) => noterEssaiRefuse(db, expire, ici, T0 + JOUR + i * 23 * HEURE).notifie,
    );
    expect(notifies).toEqual([true, false, true, false]);
    expect(courriels("essai_refuse")[0]).toMatchObject({ motif: "expire", finLe: T0 + JOUR });
  });

  it("les notifications de deux liens différents sont indépendantes", () => {
    const a = creerLien(db, { ...nouveau, dureeJours: 1 }, T0).lien;
    const b = creerLien(db, { ...nouveau, dureeJours: 1 }, T0).lien;
    expect(noterEssaiRefuse(db, a, ici, T0 + 2 * JOUR).notifie).toBe(true);
    expect(noterEssaiRefuse(db, b, ici, T0 + 2 * JOUR).notifie).toBe(true);
  });
});

describe("noterDocument", () => {
  it("ignore une seconde lecture du même document par le même lien dans les 10 minutes", () => {
    const a = creerLien(db, { ...nouveau, documents: ["cv", "portfolio"] }, T0).lien;
    const b = creerLien(db, { ...nouveau, documents: ["cv"] }, T0).lien;

    expect(noterDocument(db, a.id, "cv", ici, T0)).toBe(true);
    // Requêtes Range du lecteur PDF.
    expect(noterDocument(db, a.id, "cv", ici, T0 + 1)).toBe(false);
    expect(noterDocument(db, a.id, "cv", ici, T0 + DOUBLON_DOCUMENT - 1)).toBe(false);
    // Autre document, autre lien : notés.
    expect(noterDocument(db, a.id, "portfolio", ici, T0 + 2)).toBe(true);
    expect(noterDocument(db, b.id, "cv", ici, T0 + 3)).toBe(true);
    // Passé le délai, la lecture est notée de nouveau.
    expect(noterDocument(db, a.id, "cv", ici, T0 + DOUBLON_DOCUMENT + 1)).toBe(true);

    expect(consultations(a.id)).toEqual([
      { type: "document", document: "cv", le: T0, pays: "FR", navigateur: "Firefox · Windows" },
      {
        type: "document",
        document: "portfolio",
        le: T0 + 2,
        pays: "FR",
        navigateur: "Firefox · Windows",
      },
      {
        type: "document",
        document: "cv",
        le: T0 + DOUBLON_DOCUMENT + 1,
        pays: "FR",
        navigateur: "Firefox · Windows",
      },
    ]);
  });
});

describe("noterRefus", () => {
  it(`alerte au-delà de ${SEUIL_ALERTE} refus sur une heure glissante, au plus une fois par heure`, () => {
    const compteur = new CompteurRefus();
    const alertes: number[] = [];
    for (let i = 0; i < SEUIL_ALERTE; i++) {
      if (noterRefus(db, compteur, T0 + i * 1000)) alertes.push(i);
    }
    expect(alertes).toEqual([]);
    expect(noterRefus(db, compteur, T0 + 300_000)).toBe(true);
    for (let i = 0; i < 500; i++) expect(noterRefus(db, compteur, T0 + 301_000 + i)).toBe(false);
    expect(courriels("alerte")).toEqual([
      { refus: SEUIL_ALERTE + 1, depuis: T0, jusqua: T0 + 300_000, creeLe: T0 + 300_000 },
    ]);
    // Une heure après la première alerte, l'attaque continue : une seconde alerte, une seule.
    const suite = Array.from({ length: 2 * SEUIL_ALERTE }, (_, i) =>
      noterRefus(db, compteur, T0 + 300_000 + HEURE + i),
    );
    expect(suite.filter(Boolean)).toHaveLength(1);
    expect(courriels("alerte")).toHaveLength(2);
  });

  it("oublie les refus de plus d'une heure", () => {
    const compteur = new CompteurRefus();
    for (let i = 0; i < SEUIL_ALERTE; i++) noterRefus(db, compteur, T0);
    expect(noterRefus(db, compteur, T0 + HEURE)).toBe(false);
    expect(compteur.ajouter(T0 + HEURE)).toEqual({ total: 2, depuis: T0 + HEURE });
  });

  it("la file fait foi : pas de seconde alerte dans l'heure après un redémarrage", () => {
    const avant = new CompteurRefus();
    for (let i = 0; i <= SEUIL_ALERTE; i++) noterRefus(db, avant, T0);
    expect(courriels("alerte")).toHaveLength(1);
    const apres = new CompteurRefus();
    for (let i = 0; i <= SEUIL_ALERTE + 5; i++) noterRefus(db, apres, T0 + 30 * MINUTE);
    expect(courriels("alerte")).toHaveLength(1);
  });
});
