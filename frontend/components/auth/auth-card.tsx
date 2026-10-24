import Link from "next/link";
import type { ReactNode } from "react";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div>
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-soft sm:p-8">
        <h1 className="font-display text-4xl font-semibold leading-tight text-navy">{title}</h1>
        {subtitle && <p className="mt-2 text-base leading-7 text-muted">{subtitle}</p>}
        <div className="mt-7">{children}</div>
      </div>
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-ocean underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
