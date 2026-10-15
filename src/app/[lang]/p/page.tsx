import type { Metadata } from "next";
import { isLocale } from "@/lib/i18n";
import { resolveLocale } from "@/lib/route";
import { Acces } from "./Acces";
import { textes } from "./textes";

// Page d'arrivée des liens personnels : identique pour tous, elle ne lit aucune base et
// n'enregistre rien. Le jeton reste dans le fragment jusqu'au clic.
export async function generateMetadata({ params }: PageProps<"/[lang]/p">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return {
    title: textes[lang].metaTitre,
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function PageAcces({ params }: PageProps<"/[lang]/p">) {
  const lang = await resolveLocale(params);
  const t = textes[lang];

  return (
    <main id="contenu" className="wrap">
      <section className="section" aria-labelledby="titre">
        <p className="section__label">{t.etiquette}</p>
        <div className="section__body">
          <h1 id="titre">{t.titre}</h1>
          <noscript>
            <p>{t.noscript}</p>
          </noscript>
          <Acces lang={lang} />
        </div>
      </section>
    </main>
  );
}
