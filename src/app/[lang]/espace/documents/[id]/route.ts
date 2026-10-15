import { sessionCourante, sessionDansLaLimite } from "@/lib/espace/acces";
import { lireDocument } from "@/lib/espace/documents";
import { EN_TETES_DOCUMENT } from "@/lib/espace/en-tetes";
import { isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Une seule réponse pour tous les refus : sans session, session expirée ou au-delà de la limite
// de débit, document hors du lien ou absent du catalogue, fichier manquant, trop grand ou d'un
// autre type. Rien dans le corps ni les en-têtes ne permet de distinguer ces cas.
function introuvable(): Response {
  return new Response(null, { status: 404, headers: EN_TETES_DOCUMENT });
}

/** Document réservé, servi en PDF à la seule session dont le lien l'ouvre. */
export async function GET(
  _requete: Request,
  { params }: RouteContext<"/[lang]/espace/documents/[id]">,
) {
  const { lang, id } = await params;
  // Session revérifiée en base avant toute lecture sur le disque.
  const session = await sessionCourante();
  if (!isLocale(lang) || !session || !sessionDansLaLimite(session)) return introuvable();

  const document = await lireDocument(id, lang, session.lien.documents);
  if (!document) return introuvable();

  // Journal des consultations : appeler ici noterDocument(base(), session.lien.id, id, …) une
  // fois la branche du journal fusionnée (ignorer HEAD, que Next.js sert par ce GET).

  return new Response(document.contenu, {
    status: 200,
    headers: {
      ...EN_TETES_DOCUMENT,
      "Content-Type": "application/pdf",
      "Content-Length": String(document.contenu.byteLength),
      "Content-Disposition": `inline; filename="${document.nom}"`,
    },
  });
}
