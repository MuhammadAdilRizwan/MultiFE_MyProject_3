"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/supplier", label: "Overview", exact: true },
  { href: "/supplier/fabrics", label: "My fabrics", exact: false },
  { href: "/supplier/requirements", label: "Fabric needed", exact: false },
];

export function SupplierNav() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8" aria-label="Supplier">
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
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
