import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";

// 32 octets aléatoires en base64url : 256 bits, 43 caractères sans remplissage.
const OCTETS_SECRET = 32;
const FORMAT_SECRET = /^[A-Za-z0-9_-]{43}$/;

// Alphabet sans caractères ambigus (0/o, 1/l/i) pour les identifiants lus à l'écran.
const ALPHABET_ID = "23456789abcdefghjkmnpqrstuvwxyz";
const LONGUEUR_ID = 6;
const FORMAT_ID = new RegExp(`^l-[${ALPHABET_ID}]{${LONGUEUR_ID}}$`);

/** Secret à usage de jeton de lien ou d'identifiant de session : seul son condensé est stocké. */
export function genererSecret(): string {
  return randomBytes(OCTETS_SECRET).toString("base64url");
}

export function estSecretBienForme(valeur: unknown): valeur is string {
  return typeof valeur === "string" && FORMAT_SECRET.test(valeur);
}

/** Condensé SHA-256 : le secret est déjà aléatoire sur 256 bits, un sel ou un hachage lent n'apporterait rien. */
export function empreinte(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

/** Identifiant de lien affiché à l'administrateur (ex. « l-7kq2mz ») : aléatoire, pas secret. */
export function genererIdLien(): string {
  let id = "l-";
  for (let i = 0; i < LONGUEUR_ID; i++) id += ALPHABET_ID[randomInt(ALPHABET_ID.length)];
  return id;
}

export function estIdLien(valeur: unknown): valeur is string {
  return typeof valeur === "string" && FORMAT_ID.test(valeur);
}
