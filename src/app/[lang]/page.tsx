import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";

export default async function Home({ params }: PageProps<"/[lang]">) {
  // Rendu à la requête : chaque réponse porte son propre nonce CSP.
  await connection();
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);

  return (
    <main id="contenu" className="wrap">
      <section className="section" aria-labelledby="titre">
        <p className="section__label">{dict.title}</p>
        <div className="section__body">
          <h1 id="titre">{dict.role}</h1>
          <p className="lead">{dict.status}</p>
          <p className="muted">{dict.detail}</p>
        </div>
      </section>
    </main>
  );
}
