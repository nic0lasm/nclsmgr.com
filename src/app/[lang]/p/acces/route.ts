import { base, espaceConfigure } from "@/lib/espace/base";
import { cleIp, LimiteurDebit } from "@/lib/espace/debit";
import { EN_TETES_ROUTES } from "@/lib/espace/en-tetes";
import { attendreAuMoins, cookieSession, lireCorpsJson, origineAutorisee } from "@/lib/espace/http";
import { verifierJeton } from "@/lib/espace/liens";
import { ouvrirSession } from "@/lib/espace/sessions";

export const dynamic = "force-dynamic";

// Toute réponse part au plus tôt 250 ms après l'arrivée de la requête, succès compris : les
// écarts de temps de la base ne disent rien de l'état du lien.
const PLANCHER_MS = 250;

// 10 échanges par IP (bloc /64 en IPv6) et par 10 minutes.
const globale = globalThis as typeof globalThis & { espaceDebitAcces?: LimiteurDebit };
const debitAcces = (globale.espaceDebitAcces ??= new LimiteurDebit(10, 10 * 60_000));

/**
 * Réponse unique à tout échec : origine refusée, corps invalide, jeton mal formé, inconnu,
 * expiré ou révoqué, espace non configuré. Même statut, même corps, mêmes en-têtes, aucun cookie.
 */
function refus(): Response {
  return Response.json({ ok: false }, { status: 403, headers: EN_TETES_ROUTES });
}

function trop(reessayerDans: number): Response {
  return Response.json(
    { ok: false },
    { status: 429, headers: { ...EN_TETES_ROUTES, "Retry-After": String(reessayerDans) } },
  );
}

async function echanger(requete: Request): Promise<Response> {
  // Le contrôle d'origine passe avant le compteur : un site tiers ne peut pas épuiser, par le
  // navigateur d'un visiteur, le quota de son adresse IP.
  if (!origineAutorisee(requete.headers)) return refus();
  const debit = debitAcces.consommer(cleIp(requete.headers.get("x-client-ip")), Date.now());
  if (!debit.autorise) return trop(debit.reessayerDans);
  if (!espaceConfigure()) return refus();

  try {
    // Un corps tronqué ou une connexion coupée en cours de lecture lève : même refus.
    const corps = await lireCorpsJson(requete);
    const jeton =
      typeof corps === "object" && corps !== null && !Array.isArray(corps)
        ? (corps as Record<string, unknown>).jeton
        : undefined;
    const db = base();
    const maintenant = Date.now();
    const verification = verifierJeton(db, jeton, maintenant);
    if (!verification.valide) return refus();
    // Une nouvelle session à chaque échange : pas de fixation de session possible.
    const session = ouvrirSession(db, verification.lien, maintenant);
    return new Response(null, {
      status: 204,
      headers: {
        ...EN_TETES_ROUTES,
        "Set-Cookie": cookieSession(session.valeur, session.expireLe, maintenant),
      },
    });
  } catch {
    // Ni le jeton ni le lien dans le journal : seulement le fait.
    console.error("Espace privé : échange de jeton impossible.");
    return refus();
  }
}

export async function POST(requete: Request): Promise<Response> {
  const debut = performance.now();
  const reponse = await echanger(requete);
  await attendreAuMoins(debut, PLANCHER_MS);
  return reponse;
}
