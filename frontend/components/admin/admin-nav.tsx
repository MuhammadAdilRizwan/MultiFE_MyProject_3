"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/stores", label: "Stores" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/invite", label: "Invite users" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8" aria-label="Admin">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
              active ? "border-cyan-bright text-ink" : "border-transparent text-muted hover:text-ocean"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
