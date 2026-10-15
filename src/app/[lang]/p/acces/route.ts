import { after } from "next/server";
import { base, baseJournal, codeErreur, espaceConfigure, type Base } from "@/lib/espace/base";
import { cleIp, LimiteurDebit } from "@/lib/espace/debit";
import { EN_TETES_ROUTES } from "@/lib/espace/en-tetes";
import { attendreAuMoins, cookieSession, lireCorpsJson, origineAutorisee } from "@/lib/espace/http";
import {
  CompteurRefus,
  contexteDepuis,
  noterEssaiRefuse,
  noterOuverture,
  noterRefus,
} from "@/lib/espace/journal";
import { verifierJeton, type Lien } from "@/lib/espace/liens";
import { ouvrirSession } from "@/lib/espace/sessions";

export const dynamic = "force-dynamic";

// Toute réponse part au plus tôt 250 ms après l'arrivée de la requête, succès compris : les
// écarts de temps de la base ne disent rien de l'état du lien.
const PLANCHER_MS = 250;

// 10 échanges par IP (bloc /64 en IPv6) et par 10 minutes. À part, les échanges refusés de
// l'heure, toutes IP confondues, sont comptés pour l'alerte à Nico : seulement ceux qui ont
// passé le contrôle d'origine et le limiteur, donc de vrais essais de jeton.
const globale = globalThis as typeof globalThis & {
  espaceDebitAcces?: LimiteurDebit;
  espaceRefusAcces?: CompteurRefus;
};
const debitAcces = (globale.espaceDebitAcces ??= new LimiteurDebit(10, 10 * 60_000));
const refusAcces = (globale.espaceRefusAcces ??= new CompteurRefus());

/**
 * Ce que la requête laisse au journal, écrit après l'envoi de la réponse. Un refus ne porte un
 * lien que si le jeton est celui d'un lien expiré ou révoqué ; un jeton inconnu ne compte que
 * pour l'alerte. Une requête écartée avant l'échange (origine refusée, débit dépassé, espace
 * non configuré) ne laisse rien : une page tierce qui ne lit pas la réponse ne doit pas pouvoir
 * déclencher l'alerte.
 */
type Issue = { reponse: Response; le: number } & (
  { type: "ouverture"; lien: Lien } | { type: "refus"; lien: Lien | null } | { type: "ecartee" }
);

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

async function echanger(requete: Request): Promise<Issue> {
  const echec = (lien: Lien | null = null): Issue => ({
    reponse: refus(),
    le: Date.now(),
    type: "refus",
    lien,
  });
  const ecartee = (reponse: Response): Issue => ({ reponse, le: Date.now(), type: "ecartee" });
  // Le contrôle d'origine passe avant le compteur : un site tiers ne peut pas épuiser, par le
  // navigateur d'un visiteur, le quota de son adresse IP.
  if (!origineAutorisee(requete.headers)) return ecartee(refus());
  const debit = debitAcces.consommer(cleIp(requete.headers.get("x-client-ip")), Date.now());
  if (!debit.autorise) return ecartee(trop(debit.reessayerDans));
  if (!espaceConfigure()) return ecartee(refus());

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
    if (!verification.valide) return echec(verification.lien);
    // Une nouvelle session à chaque échange : pas de fixation de session possible.
    const session = ouvrirSession(db, verification.lien, maintenant);
    return {
      reponse: new Response(null, {
        status: 204,
        headers: {
          ...EN_TETES_ROUTES,
          "Set-Cookie": cookieSession(session.valeur, session.expireLe, maintenant),
        },
      }),
      le: maintenant,
      type: "ouverture",
      lien: verification.lien,
    };
  } catch {
    // Ni le jeton ni le lien dans le journal : seulement le fait.
    console.error("Espace privé : échange de jeton impossible.");
    return echec();
  }
}

/**
 * Journal, date de première ouverture et notifications. Appelé par after() : la durée et le
 * contenu de la réponse ne dépendent pas de ces écritures. Elles passent par la connexion du
 * journal, qui n'attend le verrou d'écriture que 100 ms : une base tenue par le service
 * courrier ne gèle pas le processus. Une erreur n'écrit qu'un message générique et le code
 * SQLite, sans jeton, empreinte, nom ni organisation.
 */
function consigner(issue: Issue, enTetes: Headers): void {
  if (issue.type === "ecartee" || !espaceConfigure()) return;
  const etape = (ecrire: (db: Base) => unknown) => {
    try {
      ecrire(baseJournal());
    } catch (erreur) {
      console.error(
        `Espace privé : écriture du journal des consultations impossible (${codeErreur(erreur)}).`,
      );
    }
  };
  if (issue.type === "ouverture") {
    const { lien } = issue;
    etape((db) => noterOuverture(db, lien, contexteDepuis(enTetes), issue.le));
    return;
  }
  // Le refus est compté même si l'écriture de l'essai échoue, et inversement.
  etape((db) => noterRefus(db, refusAcces, issue.le));
  const { lien } = issue;
  if (lien) etape((db) => noterEssaiRefuse(db, lien, contexteDepuis(enTetes), issue.le));
}

export async function POST(requete: Request): Promise<Response> {
  const debut = performance.now();
  const issue = await echanger(requete);
  after(() => consigner(issue, requete.headers));
  await attendreAuMoins(debut, PLANCHER_MS);
  return issue.reponse;
}
