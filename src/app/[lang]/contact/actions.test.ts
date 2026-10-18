import { beforeEach, describe, expect, it, vi } from "vitest";
import { ouvrirBase, type Base } from "@/lib/espace/base";
import { migrer } from "@/lib/espace/migrations";
import { DELAI_MIN, emettreJeton } from "@/lib/contact/delai";
import { ENVOIS_MAX } from "@/lib/contact/limite";
import { MAX_CONTACTS_EN_ATTENTE } from "@/lib/espace/courriels";
import { CHAMP_PIEGE } from "@/lib/contact/formulaire";
import { etatInitial } from "./etat";

const entetes = new Map<string, string>();
let db: Base;

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (cle: string) => entetes.get(cle) ?? null }),
}));
vi.mock("@/lib/espace/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/espace/base")>()),
  base: () => db,
}));

const { envoyerMessage } = await import("./actions");

function formulaire(champs: Record<string, string> = {}) {
  const donnees = new FormData();
  const tout = {
    langue: "fr",
    nom: "Alex",
    courriel: "alex@example.com",
    objet: "Recrutement",
    message: "Bonjour Nico",
    jeton: emettreJeton(Date.now() - DELAI_MIN - 1000),
    ...champs,
  };
  for (const [cle, valeur] of Object.entries(tout)) donnees.set(cle, valeur);
  return donnees;
}

function enFile() {
  return db.prepare("SELECT modele, donnees FROM courriels").all() as {
    modele: string;
    donnees: string;
  }[];
}

let ip = 0;
beforeEach(() => {
  db = ouvrirBase(":memory:");
  migrer(db);
  entetes.clear();
  entetes.set("sec-fetch-site", "same-origin");
  // Une adresse par test : le limiteur est partagé par tout le module.
  entetes.set("x-client-ip", `198.51.100.${++ip}`);
});

describe("envoyerMessage", () => {
  it("met le message en file avec l'objet et la langue", async () => {
    expect(await envoyerMessage(etatInitial, formulaire())).toEqual({ statut: "envoye" });
    const [courriel] = enFile();
    expect(courriel?.modele).toBe("contact");
    expect(JSON.parse(courriel?.donnees ?? "{}")).toMatchObject({
      nom: "Alex",
      courriel: "alex@example.com",
      message: "Objet : Recrutement\nLangue de la page : FR\n\nBonjour Nico",
    });
  });

  it("refuse sans détail une requête venue d'un autre site", async () => {
    for (const valeur of ["cross-site", "same-site", "none"]) {
      entetes.set("sec-fetch-site", valeur);
      expect(await envoyerMessage(etatInitial, formulaire())).toMatchObject({ global: "echec" });
    }
    expect(enFile()).toEqual([]);
    // Sans l'en-tête (navigateur ancien), c'est la vérification d'origine de Next.js qui joue.
    entetes.delete("sec-fetch-site");
    expect(await envoyerMessage(etatInitial, formulaire())).toEqual({ statut: "envoye" });
  });

  it("refuse une langue inconnue", async () => {
    const etat = await envoyerMessage(etatInitial, formulaire({ langue: "de" }));
    expect(etat).toMatchObject({ global: "echec" });
  });

  it("fait croire au robot que son message est parti", async () => {
    const etat = await envoyerMessage(etatInitial, formulaire({ [CHAMP_PIEGE]: "https://spam" }));
    expect(etat).toEqual({ statut: "envoye" });
    expect(enFile()).toEqual([]);
  });

  it("renvoie les erreurs de champ et les valeurs saisies", async () => {
    const etat = await envoyerMessage(etatInitial, formulaire({ courriel: "alex" }));
    expect(etat).toMatchObject({
      statut: "erreur",
      erreurs: { courriel: "invalide" },
      valeurs: { nom: "Alex", courriel: "alex" },
    });
    expect(enFile()).toEqual([]);
  });

  it("limite les envois depuis une même adresse", async () => {
    for (let i = 0; i < ENVOIS_MAX; i++) {
      expect(await envoyerMessage(etatInitial, formulaire())).toEqual({ statut: "envoye" });
    }
    expect(await envoyerMessage(etatInitial, formulaire())).toMatchObject({
      global: "tropDEnvois",
      valeurs: { message: "Bonjour Nico" },
    });
    expect(enFile()).toHaveLength(ENVOIS_MAX);
    entetes.set("x-client-ip", "203.0.113.1");
    expect(await envoyerMessage(etatInitial, formulaire())).toEqual({ statut: "envoye" });
  });

  it("refuse un envoi trop rapide ou sans jeton valide, sans le compter", async () => {
    for (const jeton of [emettreJeton(), "", "abc.def"]) {
      const etat = await envoyerMessage(etatInitial, formulaire({ jeton }));
      expect(etat).toMatchObject({ global: "echec", valeurs: { message: "Bonjour Nico" } });
      // Le jeton renvoyé est neuf : le visiteur peut renvoyer son formulaire.
      expect(etat.statut === "erreur" && etat.jeton).toMatch(/^[0-9a-z]+\./);
    }
    expect(enFile()).toEqual([]);
    for (let i = 0; i < ENVOIS_MAX; i++) {
      expect(await envoyerMessage(etatInitial, formulaire())).toEqual({ statut: "envoye" });
    }
  });

  it("alerte l'administrateur une seule fois quand la file des messages est pleine", async () => {
    const insertion = db.prepare(
      "INSERT INTO courriels (modele, donnees, cree_le) VALUES ('contact', '{}', ?)",
    );
    for (let i = 0; i < MAX_CONTACTS_EN_ATTENTE; i++) insertion.run(Date.now() - 1000);
    for (let i = 0; i < 2; i++) {
      entetes.set("x-client-ip", `192.0.2.${i + 1}`);
      expect(await envoyerMessage(etatInitial, formulaire())).toMatchObject({ global: "echec" });
    }
    const alertes = enFile().filter((c) => c.modele === "alerte");
    expect(alertes).toHaveLength(1);
    expect(JSON.parse(alertes[0]?.donnees ?? "{}")).toMatchObject({
      motif: "file_contact",
      refus: MAX_CONTACTS_EN_ATTENTE,
    });
  });

  it("répond de façon neutre si la file est indisponible", async () => {
    db.close();
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await envoyerMessage(etatInitial, formulaire())).toMatchObject({ global: "echec" });
    expect(erreur).toHaveBeenCalledWith("Contact : mise en file impossible.", "TypeError");
    erreur.mockRestore();
  });
});
