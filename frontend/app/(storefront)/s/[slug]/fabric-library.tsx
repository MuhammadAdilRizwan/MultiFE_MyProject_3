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
import { startDraft, useDraft } from "@/lib/order-draft";

// Filters come from the fabric properties the store's feed actually sends;
// a filter with no values in this store isn't shown.
const FILTER_KEYS = ["fibre", "weight", "drape"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
const FILTER_LABELS: Record<FilterKey, string> = { fibre: "Fibre", weight: "Weight", drape: "Drape" };
const NO_FILTERS: Record<FilterKey, string> = { fibre: "", weight: "", drape: "" };

const propertyOf = (f: StoreFabric, key: string) => fabricProperties(f).find((p) => p.key === key)?.value ?? "";

export function FabricLibrary({ brandSlug, fabrics }: { brandSlug: string; fabrics: StoreFabric[] }) {
  const router = useRouter();
  const draft = useDraft();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<FilterKey, string>>(NO_FILTERS);
  const [picked, setPicked] = useState<string | null>(null);

  // Returning customers see the fabric they already chose in this store.
  const selectedId = picked ?? (draft?.brandSlug === brandSlug ? draft.fabricId : null);

  const filterValues = useMemo(
    () =>
      FILTER_KEYS.map((key) => ({
        key,
        values: [...new Set(fabrics.map((f) => propertyOf(f, key)).filter(Boolean))].sort(),
      })).filter((f) => f.values.length > 0),
    [fabrics],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fabrics.filter(
      (f) =>
        (!q || `${fabricName(f)} ${f.composition ?? ""}`.toLowerCase().includes(q)) &&
        FILTER_KEYS.every((key) => !filters[key] || propertyOf(f, key) === filters[key]),
    );
  }, [fabrics, query, filters]);

  const active = Object.values(filters).some(Boolean) || query.trim() !== "";

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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fabrics..."
              className={`${inputClasses} pl-12`}
            />
          </div>
          {filterValues.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
            {filterValues.map(({ key, values }) => (
              <div key={key}>
                <label htmlFor={`filter-${key}`} className="sr-only">
                  {FILTER_LABELS[key]}
                </label>
                <select
                  id={`filter-${key}`}
                  value={filters[key]}
                  onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
                  className={`${inputClasses} truncate px-3 text-sm font-semibold sm:px-4`}
                >
                  <option value="">{FILTER_LABELS[key]}</option>
                  {values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            ))}
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
            <p className="text-base font-semibold text-ink">No fabrics match these filters.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilters(NO_FILTERS);
              }}
              className="mt-3 text-sm font-semibold text-ocean hover:underline"
            >
              Clear filters
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
