"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ActionBar, ArrowIcon } from "@/components/order/action-bar";
import { SelectedBadge, optionCardClasses } from "@/components/order/option-card";
import { PageTitle } from "@/components/order/page-title";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/text-field";
import type { StoreFabric } from "@/app/(storefront)/catalog-actions";
import { fabricName, fabricProperties, formatPKR } from "@/lib/catalog";
import {
  AVAILABILITY_LABELS,
  NO_FILTERS,
  availabilityOf,
  availabilityOptions,
  filterFabrics,
  hasFilters,
  materialOptions,
  type Availability,
  type FabricFilters,
} from "@/lib/fabric-filters";
import { startDraft, useDraft } from "@/lib/order-draft";

const propertyOf = (f: StoreFabric, key: string) => fabricProperties(f).find((p) => p.key === key)?.value ?? "";

const selectClasses = `${inputClasses} h-11 pr-10 text-sm font-semibold`;

export function FabricLibrary({
  brandSlug,
  fabrics,
  availableMetres,
}: {
  brandSlug: string;
  fabrics: StoreFabric[];
  // Metres left to sell per fabric id (roll − fabric held for orders).
  availableMetres: Record<string, number>;
}) {
  const router = useRouter();
  const draft = useDraft();
  const [filters, setFilters] = useState<FabricFilters>(NO_FILTERS);
  const [picked, setPicked] = useState<string | null>(null);

  // Returning customers see the fabric they already chose in this store.
  const selectedId = picked ?? (draft?.brandSlug === brandSlug ? draft.fabricId : null);

  const metresOf = (id: string) => availableMetres[id] ?? 0;
  const materials = useMemo(() => materialOptions(fabrics), [fabrics]);
  const availability = useMemo(
    () => availabilityOptions(fabrics, (id) => availableMetres[id] ?? 0),
    [fabrics, availableMetres],
  );

  // Search by name or composition, plus the material and availability dropdowns.
  const visible = useMemo(
    () => filterFabrics(fabrics, filters, (id) => availableMetres[id] ?? 0),
    [fabrics, filters, availableMetres],
  );

  const active = hasFilters(filters);
  const update = (patch: Partial<FabricFilters>) => setFilters((current) => ({ ...current, ...patch }));

  function proceed() {
    if (!selectedId) return;
    startDraft(brandSlug, selectedId);
    router.push(`/s/${brandSlug}/fabrics/${selectedId}`);
  }

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 lg:px-8">
        <PageTitle label="Fabric library" title="Choose the Fabric" subtitle="Premium fabrics for women's custom clothing." />

        <div className="mx-auto mt-8 max-w-3xl">
          <label htmlFor="fabric-search" className="sr-only">
            Search fabrics
          </label>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-hint" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-4.2-4.2" />
            </svg>
            <input
              id="fabric-search"
              type="search"
              value={filters.query}
              onChange={(e) => update({ query: e.target.value })}
              placeholder="Search fabrics..."
              className={`${inputClasses} pl-12`}
            />
          </div>

          {fabrics.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {materials.length > 0 && (
                <div className="min-w-0">
                  <label htmlFor="fabric-material" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                    Material
                  </label>
                  <select
                    id="fabric-material"
                    value={filters.material}
                    onChange={(e) => update({ material: e.target.value })}
                    className={selectClasses}
                  >
                    <option value="">All materials ({fabrics.length})</option>
                    {materials.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label} ({o.count})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className={`min-w-0 ${materials.length > 0 ? "" : "col-span-2 sm:col-span-1"}`}>
                <label htmlFor="fabric-availability" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Availability
                </label>
                <select
                  id="fabric-availability"
                  value={filters.availability}
                  onChange={(e) => update({ availability: e.target.value as Availability | "" })}
                  className={selectClasses}
                >
                  <option value="">Any availability ({fabrics.length})</option>
                  {availability.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.count === 0 && filters.availability !== o.value}>
                      {o.label} ({o.count})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {fabrics.length === 0 ? (
          <div className="mx-auto mt-10 max-w-md text-center">
            <p className="text-base font-semibold text-ink">No fabrics are available from this store right now.</p>
            <p className="mt-2 text-sm text-muted">Please check back soon, or browse another brand.</p>
          </div>
        ) : visible.length > 0 ? (
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-5">
            {visible.map((f) => {
              const selected = f.id === selectedId;
              const name = fabricName(f);
              const tag = propertyOf(f, "fibre");
              const stockState = availabilityOf(metresOf(f.id));
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPicked(f.id)}
                    className={optionCardClasses(selected)}
                  >
                    {selected && <SelectedBadge />}
                    <span className="relative flex aspect-[4/3] w-full items-center justify-center bg-cream">
                      {f.coverImage ? (
                        <Image
                          src={f.coverImage}
                          alt={`${name} fabric`}
                          fill
                          sizes="(min-width: 1024px) 220px, (min-width: 640px) 33vw, 50vw"
                          className="object-cover"
                        />
                      ) : (
                        <span aria-hidden="true" className="font-display text-4xl text-hint">
                          {name.charAt(0)}
                        </span>
                      )}
                    </span>
                    <span className="flex items-end justify-between gap-2 px-3 py-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink sm:text-base">{name}</span>
                        <span className="mt-0.5 block text-xs font-semibold text-muted">
                          {formatPKR(f.price_per_metre)} / m
                        </span>
                        {stockState !== "in_stock" && (
                          <span
                            className={`mt-0.5 block text-xs font-semibold ${stockState === "out_of_stock" ? "text-danger" : "text-warning"}`}
                          >
                            {AVAILABILITY_LABELS[stockState]}
                          </span>
                        )}
                      </span>
                      {tag && (
                        <span className="hidden flex-none text-[11px] font-semibold uppercase tracking-wide text-ocean sm:inline">
                          {tag}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mx-auto mt-10 max-w-md text-center">
            <p className="text-base font-semibold text-ink">
              {filters.query.trim() ? (
                <>
                  No fabrics match &ldquo;{filters.query.trim()}&rdquo;
                  {filters.material || filters.availability ? " with these filters" : ""}.
                </>
              ) : (
                "No fabrics match these filters."
              )}
            </p>
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className="mt-3 text-sm font-semibold text-ocean hover:underline">
              Clear search and filters
            </button>
          </div>
        )}
        {active && visible.length > 0 && (
          <p className="mt-4 text-center text-sm text-muted">
            Showing {visible.length} of {fabrics.length} fabrics
          </p>
        )}
      </section>

      <ActionBar>
        <button type="button" onClick={proceed} disabled={!selectedId} className={`${buttonClasses("primary")} w-full`}>
          {selectedId ? "Proceed" : "Select a fabric"}
          <ArrowIcon />
        </button>
      </ActionBar>
    </>
  );
}
