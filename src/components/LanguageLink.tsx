"use client";

import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { switchLocalePath } from "@/lib/navigation";

export function LanguageLink({
  target,
  name,
  className,
}: {
  target: Locale;
  name: string;
  className?: string;
}) {
  const pathname = usePathname();
  const code = target.toUpperCase();
  // Lien classique : changer de langue recharge la page avec son propre <html lang>.
  return (
    <a
      href={switchLocalePath(pathname, target)}
      hrefLang={target}
      lang={target}
      className={className}
      aria-label={`${name} (${code})`}
    >
      {code}
    </a>
  );
}
