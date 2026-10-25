"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ActionBar } from "@/components/order/action-bar";
import { OrderGate, type OrderContext } from "@/components/order/order-gate";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { PageTitle } from "@/components/order/page-title";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { estimateOrderFrom, fabricName, formatMetres, formatPKR, templateImage } from "@/lib/catalog";
import { selectedOption, unsupportedChoices } from "@/lib/customization";
import { dropSelections } from "@/lib/order-draft";

export function FinalReview() {
  return <OrderGate needTemplate>{(ctx) => <Review ctx={ctx} />}</OrderGate>;
}

function Review({ ctx }: { ctx: OrderContext }) {
  const [saved, setSaved] = useState(false);
  const { draft, brand, fabric, steps } = ctx;
  const t = ctx.template!;

  // Agreed: a choice the store stopped offering is never swapped silently.
  // If its whole group is gone it drops out (and we say so); otherwise the
  // customer has to re-pick it before saving.
  const unsupported = unsupportedChoices(steps, draft.selections, draft.labels);
  const [removed] = useState(() => unsupported.filter((c) => !c.stepSlug).map((c) => c.label));
  const toRepick = unsupported.filter((c) => c.stepSlug);
  const goneKeys = unsupported.filter((c) => !c.stepSlug).map((c) => c.groupKey).join("|");
  useEffect(() => {
    if (goneKeys) dropSelections(goneKeys.split("|"));
  }, [goneKeys]);

  const selection = Object.fromEntries(steps.flatMap((s) => s.groups.map((g) => [g.id, selectedOption(g, draft.selections).id])));
  const estimate = estimateOrderFrom(t, fabric, selection);
  const name = fabricName(fabric);
  const preview = templateImage(t.slug) ?? fabric.images[0]?.url ?? null;
  const lastHref = steps.length > 0 ? `/order/customize/${steps[steps.length - 1].slug}` : "/order/preview";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <OrderTopBar backHref={lastHref} storeName={brand.name} />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <PageTitle
            title="Final Customization Review"
            subtitle="Preview the selected fabric and outfit details before saving."
          />

          {(removed.length > 0 || toRepick.length > 0) && (
            <div className="mx-auto mt-6 max-w-2xl space-y-3">
              {removed.length > 0 && (
                <Alert tone="warning">
                  {brand.name} no longer offers {removed.join(", ")} for this fabric, so{" "}
                  {removed.length === 1 ? "it has" : "they have"} been removed from your design.
                </Alert>
              )}
              {toRepick.length > 0 && (
                <Alert tone="warning">
                  {brand.name} no longer offers{" "}
                  {toRepick.map((c, i) => (
                    <span key={c.groupKey}>
                      {i > 0 && ", "}
                      <Link href={`/order/customize/${c.stepSlug}?return=review`} className="font-semibold underline">
                        {c.label}
                      </Link>
                    </span>
                  ))}{" "}
                  for this fabric. Please choose again before saving.
                </Alert>
              )}
            </div>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start lg:gap-8">
            <aside className="overflow-hidden rounded-3xl border border-line bg-white shadow-card lg:sticky lg:top-24">
              <div className="relative flex aspect-square items-center justify-center bg-cream">
                {preview ? (
                  <Image src={preview} alt={`${t.name} preview`} fill priority sizes="(min-width: 1024px) 352px, 100vw" className="object-cover" />
                ) : (
                  <span aria-hidden="true" className="font-display text-8xl text-hint">
                    {t.name.charAt(0)}
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-4 pb-4 pt-12 text-white">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Your outfit</p>
                  <p className="mt-1 text-sm font-semibold">
                    {name} · {t.name}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4">
                <SummaryChip label="Fabric" value={name} image={fabric.images[0]?.url ?? null} href={`/s/${brand.slug}`} />
                <SummaryChip label="Template" value={t.name} image={templateImage(t.slug)} href="/order/template" />
              </div>
              <dl className="divide-y divide-line border-t border-line px-4 text-sm">
                {estimate && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-muted">Fabric (est. {formatMetres(estimate.metres)})</dt>
                    <dd className="font-bold text-ink">{formatPKR(Math.round(estimate.metres * fabric.price_per_metre))}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="text-muted">Stitching</dt>
                  <dd className="font-bold text-ink">{formatPKR(t.base_stitch_price)}</dd>
                </div>
                {estimate && (
                  <div className="flex items-center justify-between gap-3 py-4">
                    <dt className="font-bold text-ink">Estimated order from</dt>
                    <dd className="text-base font-extrabold text-ocean">{formatPKR(estimate.total)}</dd>
                  </div>
                )}
              </dl>
            </aside>

            <section aria-labelledby="details-heading">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 id="details-heading" className="text-xs font-bold uppercase tracking-[0.14em] text-ocean">
                    Selected details
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {steps.length > 0 ? "Tap Edit on any section to change it." : "This template has no style choices for this fabric."}
                  </p>
                </div>
                {steps.length > 0 && (
                  <span className="rounded-full bg-cyan-bright/10 px-3 py-1 text-xs font-bold text-ocean">
                    {steps.length} {steps.length === 1 ? "item" : "items"}
                  </span>
                )}
              </div>

              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {steps.map((s) => {
                  const main = selectedOption(s.groups[0], draft.selections);
                  const rest = s.groups.slice(1).map((g) => selectedOption(g, draft.selections).label);
                  return (
                    <li key={s.slug} className="flex gap-3 rounded-2xl border border-line bg-white p-3 shadow-card">
                      <span className="relative flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-xl bg-cream">
                        {main.image ? (
                          <Image src={main.image} alt="" fill sizes="80px" className="object-cover" />
                        ) : (
                          <span aria-hidden="true" className="font-display text-2xl text-hint">
                            {main.label.charAt(0)}
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{s.reviewLabel}</p>
                        <p className="mt-0.5 truncate text-sm font-bold text-ink">{main.label}</p>
                        {rest.length > 0 && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{rest.join(" · ")}</p>}
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
      <ActionBar backHref={lastHref}>
        {saved ? (
          <div className="w-full">
            <Alert tone="success">Your design is saved on this device. Measurements and checkout come next.</Alert>
          </div>
        ) : (
          <button
            type="button"
            disabled={toRepick.length > 0}
            onClick={() => setSaved(true)}
            className={`${buttonClasses("primary")} w-full`}
          >
            Save Review
          </button>
        )}
      </ActionBar>
    </div>
  );
}

function SummaryChip({ label, value, image, href }: { label: string; value: string; image: string | null; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-2xl border border-cyan-bright/40 p-2 transition-colors hover:border-cyan-bright">
      <span className="relative flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full bg-cream">
        {image ? (
          <Image src={image} alt="" fill sizes="36px" className="object-cover" />
        ) : (
          <span aria-hidden="true" className="font-display text-base text-hint">
            {value.charAt(0)}
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-bold uppercase tracking-wide text-muted">{label}</span>
        <span className="block truncate text-xs font-bold text-ink">{value}</span>
      </span>
    </Link>
  );
}
