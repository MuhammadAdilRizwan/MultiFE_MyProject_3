import Image from "next/image";
import type { ReactNode } from "react";
import { FABRIC_STATUS_LABELS, type FabricStatus } from "@/lib/supplier-panel-stats";

// Small building blocks shared by the supplier panel pages.

export function PanelTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean">Supplier panel</p>
      <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{title}</h1>
      <p className="max-w-2xl text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl text-ink">{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-muted">{hint}</dd>}
    </div>
  );
}

const STATUS_TONES: Record<FabricStatus, string> = {
  on_sale: "bg-success-soft text-success",
  low_stock: "bg-warning-soft text-warning",
  out_of_stock: "bg-danger-soft text-danger",
  awaiting_setup: "bg-cyan-bright/10 text-ocean",
  hidden: "bg-ink/5 text-muted",
};

export function FabricStatusBadge({ status }: { status: FabricStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONES[status]}`}>
      {FABRIC_STATUS_LABELS[status]}
    </span>
  );
}

export function FabricThumb({ image, name, size = 48 }: { image: string | null; name: string; size?: number }) {
  return (
    <span
      className="relative flex flex-none items-center justify-center overflow-hidden rounded-xl bg-cream"
      style={{ width: size, height: size }}
    >
      {image ? (
        <Image src={image} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span aria-hidden="true" className="font-display text-lg text-hint">
          {name.charAt(0)}
        </span>
      )}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}
