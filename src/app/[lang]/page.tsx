import Link from "next/link";
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
  const other = lang === "fr" ? "en" : "fr";

  return (
    <main className="holding">
      <p className="brand">{dict.title}</p>
      <h1>{dict.role}</h1>
      <p>{dict.status}</p>
      <p className="muted">{dict.detail}</p>
      <Link href={`/${other}`} hrefLang={other} className="switch">
        {dict.switchLabel}
      </Link>
    </main>
  );
}
