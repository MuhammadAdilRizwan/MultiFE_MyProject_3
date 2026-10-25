import type { ReactNode } from "react";
import { HeadingRule } from "@/components/ui/heading";

export function PageTitle({ label, title, subtitle }: { label?: string; title: string; subtitle?: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {label && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean">{label}</p>}
      <h1 className="mt-2 text-balance font-display text-3xl leading-tight text-ink sm:text-4xl">{title}</h1>
      <HeadingRule className="mt-3" />
      {subtitle && <p className="mt-4 text-base leading-7 text-muted">{subtitle}</p>}
    </div>
  );
}
