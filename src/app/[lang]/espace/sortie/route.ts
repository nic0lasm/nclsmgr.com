import { cookies } from "next/headers";
import { base, espaceConfigure } from "@/lib/espace/base";
import { EN_TETES_ROUTES } from "@/lib/espace/en-tetes";
import { cookieEfface, origineAutorisee } from "@/lib/espace/http";
import { fermerSession, NOM_COOKIE } from "@/lib/espace/sessions";
import { isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/** « Quitter l'espace » : session supprimée en base, cookie effacé, retour à l'accueil. */
export async function POST(requete: Request, { params }: RouteContext<"/[lang]/espace/sortie">) {
  const { lang } = await params;
  if (!isLocale(lang)) return new Response(null, { status: 404, headers: EN_TETES_ROUTES });
  if (!origineAutorisee(requete.headers)) {
    return Response.json({ ok: false }, { status: 403, headers: EN_TETES_ROUTES });
  }

  const valeur = (await cookies()).get(NOM_COOKIE)?.value;
  if (valeur && espaceConfigure()) {
    try {
      fermerSession(base(), valeur);
    } catch {
      console.error("Espace privé : fermeture de session impossible.");
    }
  }

  return new Response(null, {
    status: 303,
    headers: {
      ...EN_TETES_ROUTES,
      Location: `/${lang}`,
      "Set-Cookie": cookieEfface(),
      "Clear-Site-Data": '"cookies"',
    },
  });
}
