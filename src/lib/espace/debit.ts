import "server-only";
import { isIP } from "node:net";

export type Decision = { autorise: true } | { autorise: false; reessayerDans: number };

type Compteur = { debut: number; nombre: number };

/**
 * Compteur à fenêtre fixe, en mémoire : suffisant avec un seul processus Node. Le nombre de
 * clés suivies est borné ; une fois la borne atteinte, les fenêtres échues sont purgées, puis
 * les plus anciennes clés cèdent leur place.
 */
export class LimiteurDebit {
  private readonly compteurs = new Map<string, Compteur>();

  constructor(
    private readonly limite: number,
    private readonly fenetreMs: number,
    private readonly maxCles = 10_000,
  ) {}

  get taille(): number {
    return this.compteurs.size;
  }

  consommer(cle: string, maintenant: number): Decision {
    let compteur = this.compteurs.get(cle);
    if (compteur && maintenant - compteur.debut >= this.fenetreMs) {
      this.compteurs.delete(cle);
      compteur = undefined;
    }
    if (!compteur) {
      this.faireDeLaPlace(maintenant);
      compteur = { debut: maintenant, nombre: 0 };
      this.compteurs.set(cle, compteur);
    }
    if (compteur.nombre >= this.limite) {
      const restant = compteur.debut + this.fenetreMs - maintenant;
      return { autorise: false, reessayerDans: Math.max(1, Math.ceil(restant / 1000)) };
    }
    compteur.nombre++;
    return { autorise: true };
  }

  private faireDeLaPlace(maintenant: number) {
    if (this.compteurs.size < this.maxCles) return;
    for (const [cle, compteur] of this.compteurs) {
      if (maintenant - compteur.debut >= this.fenetreMs) this.compteurs.delete(cle);
    }
    // L'ordre d'insertion de la Map est celui des débuts de fenêtre : on retire les plus anciennes.
    for (const cle of this.compteurs.keys()) {
      if (this.compteurs.size < this.maxCles) break;
      this.compteurs.delete(cle);
    }
  }
}

// Compartiment unique des requêtes sans IP exploitable (en-tête absent ou illisible).
export const SANS_IP = "sans-ip";

/** Les huit groupes de 16 bits d'une adresse IPv6 déjà validée par isIP. */
function groupesIPv6(adresse: string): number[] {
  let texte = adresse;
  const ipv4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(texte);
  if (ipv4) {
    const [a, b, c, d] = ipv4.slice(1).map(Number);
    texte = `${texte.slice(0, ipv4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [tete, queue] = texte.split("::");
  const gauche = tete ? tete.split(":") : [];
  const droite = queue ? queue.split(":") : [];
  const zeros = queue === undefined ? [] : Array(8 - gauche.length - droite.length).fill("0");
  return [...gauche, ...zeros, ...droite].map((groupe) => parseInt(groupe, 16));
}

/**
 * Clé de limitation pour l'en-tête X-Client-IP, que Caddy écrase lui-même : une IPv4 telle
 * quelle, une IPv6 réduite à son bloc /64 (un abonné en reçoit souvent un entier), une IPv4
 * encapsulée en IPv6 ramenée à l'IPv4. Tout le reste tombe dans un compartiment commun.
 */
export function cleIp(enTete: string | null): string {
  const adresse = (enTete ?? "").trim().replace(/%.*$/, "");
  const version = isIP(adresse);
  if (version === 4) return adresse;
  if (version !== 6) return SANS_IP;
  const groupes = groupesIPv6(adresse);
  if (groupes.slice(0, 5).every((g) => g === 0) && groupes[5] === 0xffff) {
    return [groupes[6] >> 8, groupes[6] & 0xff, groupes[7] >> 8, groupes[7] & 0xff].join(".");
  }
  return `${groupes
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
}
