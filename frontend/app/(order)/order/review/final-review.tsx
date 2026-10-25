"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ActionBar } from "@/components/order/action-bar";
import { OrderGate } from "@/components/order/order-gate";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { PageTitle } from "@/components/order/page-title";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { formatPKR } from "@/lib/catalog";
import { STEPS, selectedOption } from "@/lib/customization";

export function FinalReview() {
  const [saved, setSaved] = useState(false);

  return (
    <OrderGate needTemplate>
      {({ draft, brand, fabric, template }) => {
        const t = template!;
        const dupatta = selectedOption(STEPS.find((s) => s.slug === "dupatta")!.groups[0], draft.selections);
        const estimate = fabric.pricePerYard * fabric.recommendedYards + fabric.stitchingFrom;
        const lastStep = STEPS[STEPS.length - 1].slug;

        return (
          <div className="flex min-h-full flex-1 flex-col">
            <OrderTopBar backHref={`/order/customize/${lastStep}`} storeName={brand.name} />
            <main className="flex-1">
              <div className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
                <PageTitle
                  title="Final Customization Review"
                  subtitle="Preview the selected fabric and outfit details before saving."
                />

                <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start lg:gap-8">
                  <aside className="overflow-hidden rounded-3xl border border-line bg-white shadow-card lg:sticky lg:top-24">
                    <div className="relative aspect-square bg-cream">
                      <Image src={t.image} alt={`${t.name} preview`} fill priority sizes="(min-width: 1024px) 352px, 100vw" className="object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-4 pb-4 pt-12 text-white">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Final outfit preview</p>
                        <p className="mt-1 text-sm font-semibold">
                          {fabric.name} · {fabric.color} · {t.name} · {dupatta.label}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 p-4">
                      <SummaryChip label="Fabric / colour" value={`${fabric.name} · ${fabric.color}`} image={fabric.image} href={`/s/${brand.slug}`} />
                      <SummaryChip label="Template" value={t.name} image={t.image} href="/order/template" />
                    </div>
                    <div className="flex items-center justify-between border-t border-line px-4 py-4">
                      <span className="text-sm text-muted">Estimated order from</span>
                      <span className="text-base font-extrabold text-ocean">{formatPKR(estimate)}</span>
                    </div>
                  </aside>

                  <section aria-labelledby="details-heading">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <h2 id="details-heading" className="text-xs font-bold uppercase tracking-[0.14em] text-ocean">
                          Selected details
                        </h2>
                        <p className="mt-1 text-sm text-muted">Tap Edit on any section to change it.</p>
                      </div>
                      <span className="rounded-full bg-cyan-bright/10 px-3 py-1 text-xs font-bold text-ocean">
                        {STEPS.length} items
                      </span>
                    </div>

                    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                      {STEPS.map((s) => {
                        const main = selectedOption(s.groups[0], draft.selections);
                        const rest = s.groups.slice(1).map((g) => selectedOption(g, draft.selections).label);
                        return (
                          <li key={s.slug} className="flex gap-3 rounded-2xl border border-line bg-white p-3 shadow-card">
                            <span className="relative h-20 w-20 flex-none overflow-hidden rounded-xl bg-cream">
                              <Image src={main.image} alt="" fill sizes="80px" className="object-cover" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{s.reviewLabel}</p>
                              <p className="mt-0.5 truncate text-sm font-bold text-ink">{main.label}</p>
                              {rest.length > 0 && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{rest.join(" · ")}</p>}
                              <span className="mt-1.5 inline-block rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                                {fabric.color}
                              </span>
                            </div>
                            <Link
                              href={`/order/customize/${s.slug}?return=review`}
                              aria-label={`Edit ${s.reviewLabel}`}
                              className="self-center rounded-full border border-white/30 bg-mf-blue px-3 py-1.5 text-xs font-bold text-white shadow-blue transition-transform hover:-translate-y-px"
                            >
                              Edit
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                </div>
              </div>
            </main>
            <ActionBar backHref={`/order/customize/${lastStep}`}>
              {saved ? (
                <div className="w-full">
                  <Alert tone="success">
                    Your design is saved on this device. Measurements and checkout come next.
                  </Alert>
                </div>
              ) : (
                <button type="button" onClick={() => setSaved(true)} className={`${buttonClasses("primary")} w-full`}>
                  Save Review
                </button>
              )}
            </ActionBar>
          </div>
        );
      }}
    </OrderGate>
  );
}

function SummaryChip({ label, value, image, href }: { label: string; value: string; image: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-2xl border border-cyan-bright/40 p-2 transition-colors hover:border-cyan-bright">
      <span className="relative h-9 w-9 flex-none overflow-hidden rounded-full bg-cream">
        <Image src={image} alt="" fill sizes="36px" className="object-cover" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-bold uppercase tracking-wide text-muted">{label}</span>
        <span className="block truncate text-xs font-bold text-ink">{value}</span>
      </span>
    </Link>
  );
}
