import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isLocale, type Locale } from "@/lib/i18n";

// Rendu à la requête : chaque réponse porte son propre nonce CSP.
export async function resolveLocale(params: Promise<{ lang: string }>): Promise<Locale> {
  await connection();
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return lang;
}
