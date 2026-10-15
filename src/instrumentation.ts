// Appelé une fois au démarrage du serveur. Seul le service web migre la base de l'espace privé :
// il le fait ici, pour que le service courrier n'ait pas à attendre une première visite.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ESPACE_BASE) {
    const { base } = await import("@/lib/espace/base");
    base();
  }
}
