import type { Metadata } from "next";
import { exigerSession } from "@/lib/espace/acces";
import { isLocale } from "@/lib/i18n";
import { resolveLocale } from "@/lib/route";
import { Rechargement } from "./Rechargement";
import { textes } from "./textes";

export async function generateMetadata({ params }: PageProps<"/[lang]/espace">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return {
    title: textes[lang].metaTitre,
    robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  };
}

export default async function PageEspace({ params }: PageProps<"/[lang]/espace">) {
  const lang = await resolveLocale(params);
  // Vérification avant tout rendu : aucune frontière Suspense ni loading.tsx en amont.
  const lien = await exigerSession();
  const t = textes[lang];

  return (
    <main id="contenu" className="wrap">
      <Rechargement />
      <section className="section" aria-labelledby="titre">
        <p className="section__label">{t.etiquette}</p>
        <div className="section__body">
          <h1 id="titre">{t.titre}</h1>
          {/* Texte brut : React échappe le nom, aucun HTML n'est interprété. */}
          <p className="lead">{`${t.bonjour} ${lien.destinataire},`}</p>
          <form method="post" action={`/${lang}/espace/sortie`} className="actions">
            <button type="submit" className="button button--secondary">
              {t.quitter}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
