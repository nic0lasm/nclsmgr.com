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

// « 2026-10-15 » devient « 15 octobre 2026 » ou « 15 October 2026 ».
export function formatDay(day: string, locale: Locale): string {
  const [year, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, m - 1, d)));
}
