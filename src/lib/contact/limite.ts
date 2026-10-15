import { createHash, randomBytes } from "node:crypto";

// Limitation de débit en mémoire, par adresse IP. Les adresses ne sont gardées que sous forme
// d'empreinte salée, avec un sel tiré au démarrage du processus, et oubliées après la fenêtre.
// Une adresse IPv6 compte pour son préfixe /64, que reçoit d'ordinaire un seul abonné.

export const ENVOIS_MAX = 5;
export const FENETRE = 60 * 60 * 1000;
/** Au-delà, les entrées les plus anciennes sont oubliées pour borner la mémoire. */
const ENTREES_MAX = 10_000;

/** Préfixe /64 d'une adresse IPv6, ou l'adresse telle quelle. */
export function reseau(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [tete = "", queue] = ip.split("::");
  const debut = tete ? tete.split(":") : [];
  const fin = queue ? queue.split(":") : [];
  const groupes = [
    ...debut,
    ...Array<string>(Math.max(0, 8 - debut.length - fin.length)).fill("0"),
    ...fin,
  ];
  const prefixe = groupes.slice(0, 4).map((g) => Number.parseInt(g, 16));
  if (prefixe.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) return ip;
  return `${prefixe.map((g) => g.toString(16)).join(":")}::/64`;
}

export class Limiteur {
  private readonly sel = randomBytes(16);
  private readonly envois = new Map<string, number[]>();

  constructor(
    private readonly max = ENVOIS_MAX,
    private readonly fenetre = FENETRE,
  ) {}

  private cle(ip: string): string {
    return createHash("sha256").update(this.sel).update(reseau(ip)).digest("base64url");
  }

  private recents(cle: string, maintenant: number): number[] {
    return (this.envois.get(cle) ?? []).filter((le) => le > maintenant - this.fenetre);
  }

  /** Vrai si cette adresse peut encore envoyer un message. */
  autorise(ip: string, maintenant: number): boolean {
    return this.recents(this.cle(ip), maintenant).length < this.max;
  }

  /** Compte un envoi pour cette adresse. */
  noter(ip: string, maintenant: number): void {
    const cle = this.cle(ip);
    const recents = this.recents(cle, maintenant);
    recents.push(maintenant);
    this.envois.delete(cle);
    this.envois.set(cle, recents);
    if (this.envois.size > ENTREES_MAX) this.oublier(maintenant);
  }

  private oublier(maintenant: number): void {
    for (const [cle, dates] of this.envois) {
      if (dates.every((le) => le <= maintenant - this.fenetre)) this.envois.delete(cle);
    }
    // Map garde l'ordre d'insertion : les premières clés sont les moins récemment servies.
    for (const cle of this.envois.keys()) {
      if (this.envois.size <= ENTREES_MAX) break;
      this.envois.delete(cle);
    }
  }
}
