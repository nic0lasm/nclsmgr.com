import type { Locale } from "@/lib/i18n";

// « 2020-03 » devient « mars 2020 » ou « March 2020 ».
export function formatMonth(month: string, locale: Locale): string {
  const [year, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, m - 1, 1)));
}

export function formatPeriod(
  start: string | null,
  end: string | null,
  locale: Locale,
  ongoing: string,
): string {
  const to = end ? formatMonth(end, locale) : ongoing;
  return start ? `${formatMonth(start, locale)} · ${to}` : to;
}

// Ligne de contexte d'une étude de cas : thème, organisation et, si elle est datée, période.
export function caseMeta(
  etude: { theme: string | null; organisation: string; debut: string | null; fin: string | null },
  locale: Locale,
  ongoing: string,
): string {
  const parts = [etude.theme, etude.organisation];
  if (etude.debut) parts.push(formatPeriod(etude.debut, etude.fin, locale, ongoing));
  return parts.filter(Boolean).join(" · ");
}
