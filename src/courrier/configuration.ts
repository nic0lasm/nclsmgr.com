import { readFileSync } from "node:fs";

// Fichier secret monté par Compose, lisible par le seul service courrier. Format JSON :
// { "hote", "port", "utilisateur", "motDePasse", "expediteur", "destinataire" }.
export type ConfigurationSmtp = {
  hote: string;
  port: number;
  utilisateur: string;
  motDePasse: string;
  expediteur: string;
  destinataire: string;
};

const ADRESSE = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const HOTE = /^[a-z0-9.-]{1,253}$/i;

// Les messages d'erreur nomment le champ fautif, jamais sa valeur.
export function lireConfiguration(chemin: string): ConfigurationSmtp {
  let brut: unknown;
  try {
    brut = JSON.parse(readFileSync(chemin, "utf8"));
  } catch {
    throw new Error(`Configuration SMTP illisible : ${chemin}.`);
  }
  if (typeof brut !== "object" || brut === null) throw new Error("Configuration SMTP invalide.");
  const c = brut as Record<string, unknown>;
  const champ = (nom: string, valide: boolean) => {
    if (!valide) throw new Error(`Configuration SMTP : champ « ${nom} » invalide.`);
  };
  champ("hote", typeof c.hote === "string" && HOTE.test(c.hote));
  champ("port", c.port === 465 || c.port === 587);
  champ("utilisateur", typeof c.utilisateur === "string" && c.utilisateur.length > 0);
  champ("motDePasse", typeof c.motDePasse === "string" && c.motDePasse.length > 0);
  champ("expediteur", typeof c.expediteur === "string" && ADRESSE.test(c.expediteur));
  champ("destinataire", typeof c.destinataire === "string" && ADRESSE.test(c.destinataire));
  return c as ConfigurationSmtp;
}
