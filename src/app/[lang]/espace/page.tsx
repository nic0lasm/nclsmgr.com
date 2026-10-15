import type { Metadata } from "next";
import type { ReactNode } from "react";
import { exigerSession } from "@/lib/espace/acces";
import { lirePrive, vide } from "@/lib/espace/prive";
import { blocsParProfil, type Bloc } from "@/lib/espace/profils";
import { isLocale } from "@/lib/i18n";
import { resolveLocale } from "@/lib/route";
import { BlocCoordonnees, Contributions, Etudes, Message, Parcours, References } from "./blocs";
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

const BLOCS_PRIVES: readonly Bloc[] = ["references", "coordonnees"];

export default async function PageEspace({ params }: PageProps<"/[lang]/espace">) {
  const lang = await resolveLocale(params);
  // Vérification avant tout rendu : aucune frontière Suspense ni loading.tsx en amont.
  const lien = await exigerSession();
  const t = textes[lang];
  const blocs = blocsParProfil[lien.profil] ?? [];
  // prive.json n'est lu que pour les profils qui en affichent une partie.
  const prive = blocs.some((b) => BLOCS_PRIVES.includes(b)) ? await lirePrive(lang) : vide();

  function rendre(bloc: Bloc): ReactNode {
    switch (bloc) {
      case "parcours":
        return <Parcours key={bloc} lang={lang} t={t} />;
      case "references":
        return <References key={bloc} references={prive.references} lang={lang} t={t} />;
      case "coordonnees":
        return <BlocCoordonnees key={bloc} coordonnees={prive.coordonnees} t={t} />;
      case "contributions":
        return <Contributions key={bloc} lang={lang} t={t} />;
      case "etudes":
        return <Etudes key={bloc} lang={lang} t={t} />;
    }
  }

  return (
    <main id="contenu" className="wrap">
      <Rechargement />
      <section className="section" aria-labelledby="titre">
        <p className="section__label">{t.etiquette}</p>
        <div className="section__body">
          <h1 id="titre">{t.titre}</h1>
          <Message lien={lien} lang={lang} t={t} />
          <form method="post" action={`/${lang}/espace/sortie`} className="actions">
            <button type="submit" className="button button--secondary">
              {t.quitter}
            </button>
          </form>
        </div>
      </section>
      {blocs.map(rendre)}
    </main>
  );
}
