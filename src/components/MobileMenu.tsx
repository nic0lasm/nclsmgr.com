"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

// Menu replié sous 760 px. <details> fonctionne sans script ; le script le referme après navigation.
export function MobileMenu({ label, children }: { label: string; children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  return (
    <details ref={ref} className="mobile-menu">
      <summary>{label}</summary>
      <div className="mobile-menu__panel">{children}</div>
    </details>
  );
}
