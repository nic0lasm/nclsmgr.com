const JOUR = 24 * 60 * 60 * 1000;

// RFC 9116 : Expires doit rester à moins d'un an ; recalculé à chaque requête.
export function securityTxt(maintenant: Date, validiteJours = 90): string {
  const minuit = Date.UTC(
    maintenant.getUTCFullYear(),
    maintenant.getUTCMonth(),
    maintenant.getUTCDate(),
  );
  const expiration = new Date(minuit + validiteJours * JOUR);
  // Deux canaux, par ordre de préférence : le signalement privé de GitHub, actif sur le dépôt, puis
  // l'adresse dédiée.
  return [
    "Contact: https://github.com/nic0lasm/nclsmgr.com/security/advisories/new",
    "Contact: mailto:security@nclsmgr.com",
    `Expires: ${expiration.toISOString().replace(".000Z", "Z")}`,
    "Preferred-Languages: fr, en",
    "Canonical: https://nclsmgr.com/.well-known/security.txt",
    "Policy: https://github.com/nic0lasm/nclsmgr.com/security/policy",
    "",
  ].join("\n");
}
