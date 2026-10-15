"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrentPath, type NavLink } from "@/lib/navigation";

export function NavLinks({
  links,
  listClassName,
  linkClassName,
}: {
  links: NavLink[];
  listClassName?: string;
  linkClassName?: string;
}) {
  const pathname = usePathname();
  return (
    <ul className={listClassName}>
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className={linkClassName}
            aria-current={isCurrentPath(pathname, link.href) ? "page" : undefined}
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
