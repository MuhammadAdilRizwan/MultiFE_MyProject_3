"use client";

import { useMemo, useState } from "react";
import { EmptyState, FabricStatusBadge, FabricThumb } from "@/components/supplier/panel-parts";
import { cardClasses } from "@/components/ui/card";
import { formatMetres, formatPKR } from "@/lib/catalog";
import { fabricStatus, filterFabrics, type FabricStatus, type PanelFabric } from "@/lib/supplier-panel-stats";

type Chip = "all" | "on_sale" | "stock" | "not_on_sale";

const CHIPS: { key: Chip; label: string; match: (s: FabricStatus) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "on_sale", label: "On sale", match: (s) => s === "on_sale" || s === "low_stock" },
  { key: "stock", label: "Low or out of stock", match: (s) => s === "low_stock" || s === "out_of_stock" },
  { key: "not_on_sale", label: "Not on sale", match: (s) => s === "hidden" || s === "awaiting_setup" },
];

export function FabricList({ fabrics }: { fabrics: PanelFabric[] }) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<Chip>("all");

  const withStatus = useMemo(() => fabrics.map((f) => ({ ...f, status: fabricStatus(f) })), [fabrics]);
  const counts = useMemo(
    () => Object.fromEntries(CHIPS.map((c) => [c.key, withStatus.filter((f) => c.match(f.status)).length])) as Record<Chip, number>,
    [withStatus],
  );
  const shown = useMemo(() => {
    const active = CHIPS.find((c) => c.key === chip) ?? CHIPS[0];
    return filterFabrics(withStatus, query).filter((f) => active.match(f.status));
  }, [withStatus, query, chip]);

  if (fabrics.length === 0) {
    return (
      <EmptyState title="No fabrics from your store yet">They&apos;ll appear here once MultiFe adds your catalogue.</EmptyState>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter fabrics">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChip(c.key)}
              aria-pressed={chip === c.key}
              className={`inline-flex h-9 flex-none items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                chip === c.key ? "border-transparent bg-mf-blue text-white shadow-blue" : "border-line bg-white text-ink hover:border-cyan-bright/60"
              }`}
            >
              {c.label}
              <span className={chip === c.key ? "text-white/80" : "text-muted"}>{counts[c.key]}</span>
            </button>
          ))}
        </div>
        <label className="block md:w-72">
          <span className="sr-only">Search fabrics</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, code or material"
            className="h-11 w-full rounded-[14px] border border-line bg-white/90 px-4 text-sm text-ink outline-none transition focus:border-cyan-bright focus:ring-4 focus:ring-cyan-bright/15"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No fabrics match">Try a different search or filter.</EmptyState>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {shown.map((f) => (
            <li key={f.id} className={`${cardClasses} p-4 sm:p-5`}>
              <div className="flex gap-4">
                <FabricThumb image={f.image} name={f.name} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-extrabold tracking-tight text-ink">{f.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        Code {f.externalId}
                        {f.composition ? ` · ${f.composition}` : ""}
                      </p>
                    </div>
                    <FabricStatusBadge status={f.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                    <Figure label="Price" value={`${formatPKR(f.pricePerMetre)} / m`} />
                    <Figure label="In stock" value={formatMetres(f.stockMetres)} />
                    <Figure label="Held for customers" value={formatMetres(f.heldMetres)} />
                    <Figure label="Left to sell" value={formatMetres(f.availableMetres)} />
                  </dl>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-semibold text-ink">{value}</dd>
    </div>
  );
}
