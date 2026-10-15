// Appelé une fois au démarrage du serveur. Seul le service web migre la base de l'espace privé :
// il le fait ici, pour que le service courrier n'ait pas à attendre une première visite.
// Un échec ne doit pas faire tomber le site public : il est consigné, et les pages de l'espace
// retenteront l'ouverture à leur premier appel.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ESPACE_BASE) {
    const { base } = await import("@/lib/espace/base");
    try {
      base();
    } catch (erreur) {
      console.error("Espace privé : base indisponible au démarrage.", erreur);
    }
  }
}
