"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ActionBar, ArrowIcon } from "@/components/order/action-bar";
import { SelectedBadge, optionCardClasses } from "@/components/order/option-card";
import { PageTitle } from "@/components/order/page-title";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/text-field";
import { FABRIC_FILTERS, formatPKR, type Fabric } from "@/lib/catalog";
import { startDraft, useDraft } from "@/lib/order-draft";

type FilterKey = keyof typeof FABRIC_FILTERS;
const FILTER_LABELS: Record<FilterKey, string> = { category: "Category", color: "Colour", occasion: "Occasion" };

export function FabricLibrary({ brandSlug, fabrics }: { brandSlug: string; fabrics: Fabric[] }) {
  const router = useRouter();
  const draft = useDraft();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ category: "", color: "", occasion: "" });
  const [picked, setPicked] = useState<string | null>(null);

  // Returning customers see the fabric they already chose in this store.
  const selectedId = picked ?? (draft?.brandSlug === brandSlug ? draft.fabricId : null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fabrics.filter(
      (f) =>
        (!q || `${f.name} ${f.category} ${f.color} ${f.occasion}`.toLowerCase().includes(q)) &&
        (!filters.category || f.category === filters.category) &&
        (!filters.color || f.color === filters.color) &&
        (!filters.occasion || f.occasion === filters.occasion),
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
          <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
            {(Object.keys(FABRIC_FILTERS) as FilterKey[]).map((key) => (
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
                  {FABRIC_FILTERS[key].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {visible.length > 0 ? (
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-5">
            {visible.map((f) => {
              const selected = f.id === selectedId;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPicked(f.id)}
                    className={optionCardClasses(selected)}
                  >
                    {selected && <SelectedBadge />}
                    <span className="relative block aspect-[4/3] w-full bg-cream">
                      <Image
                        src={f.image}
                        alt={`${f.name} fabric`}
                        fill
                        sizes="(min-width: 1024px) 220px, (min-width: 640px) 33vw, 50vw"
                        className="object-cover"
                      />
                    </span>
                    <span className="flex items-end justify-between gap-2 px-3 py-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink sm:text-base">{f.name}</span>
                        <span className="mt-0.5 block text-xs font-semibold text-muted">
                          {formatPKR(f.pricePerYard)} / yd
                        </span>
                      </span>
                      <span className="hidden flex-none text-[11px] font-semibold uppercase tracking-wide text-ocean sm:inline">
                        {f.category}
                      </span>
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
                setFilters({ category: "", color: "", occasion: "" });
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
