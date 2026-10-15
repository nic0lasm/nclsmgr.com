import { after } from "next/server";
import { sessionCourante, sessionDansLaLimite } from "@/lib/espace/acces";
import { baseJournal, codeErreur } from "@/lib/espace/base";
import { lireDocument } from "@/lib/espace/documents";
import { EN_TETES_DOCUMENT } from "@/lib/espace/en-tetes";
import { contexteDepuis, noterDocument } from "@/lib/espace/journal";
import { isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Une seule réponse pour tous les refus : sans session, session expirée ou au-delà de la limite
// de débit, document hors du lien ou absent du catalogue, fichier manquant, trop grand ou d'un
// autre type. Rien dans le corps ni les en-têtes ne permet de distinguer ces cas.
function introuvable(): Response {
  return new Response(null, { status: 404, headers: EN_TETES_DOCUMENT });
}

/**
 * Lecture notée au journal des consultations, appelée par after() : la réponse ne dépend pas
 * de cette écriture. Elle passe par la connexion du journal, qui n'attend le verrou d'écriture
 * que 100 ms. Une erreur n'écrit qu'un message fixe et le code SQLite, sans lien ni document.
 */
function consignerLecture(lienId: string, document: string, enTetes: Headers, le: number): void {
  try {
    noterDocument(baseJournal(), lienId, document, contexteDepuis(enTetes), le);
  } catch (erreur) {
    console.error(
      `Espace privé : écriture du journal des consultations impossible (${codeErreur(erreur)}).`,
    );
  }
}

/** Document réservé, servi en PDF à la seule session dont le lien l'ouvre. */
export async function GET(
  requete: Request,
  { params }: RouteContext<"/[lang]/espace/documents/[id]">,
) {
  const { lang, id } = await params;
  // Session revérifiée en base avant toute lecture sur le disque.
  const session = await sessionCourante();
  if (!isLocale(lang) || !session || !sessionDansLaLimite(session)) return introuvable();

  const document = await lireDocument(id, lang, session.lien.documents);
  if (!document) return introuvable();

  // Next.js sert HEAD par ce même GET : seule une lecture GET est notée. Les requêtes répétées
  // d'une visionneuse PDF sont dédoublonnées par noterDocument.
  if (requete.method === "GET") {
    const lienId = session.lien.id;
    const le = Date.now();
    after(() => consignerLecture(lienId, id, requete.headers, le));
  }

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
