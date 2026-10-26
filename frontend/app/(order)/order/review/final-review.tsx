"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { PriceBreakdown } from "@multife/backend/modules/rules/priceOrder";
import { priceDraftAction, takeSoftReservationAction } from "@/app/(order)/order-actions";
import { ActionBar } from "@/components/order/action-bar";
import { OrderGate, type OrderContext } from "@/components/order/order-gate";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { PageTitle } from "@/components/order/page-title";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { estimateOrderFrom, fabricName, formatMetres, formatPKR, templateImage } from "@/lib/catalog";
import { selectedOption, unsupportedChoices } from "@/lib/customization";
import { dropSelections } from "@/lib/order-draft";
import { syncRemoteOptions } from "@/lib/order-sync";

type ServerPrice =
  | { status: "loading" }
  | { status: "ready"; draftId: string; price: PriceBreakdown }
  | { status: "error"; error: string };

export function FinalReview() {
  return <OrderGate needTemplate>{(ctx) => <Review ctx={ctx} />}</OrderGate>;
}

function Review({ ctx }: { ctx: OrderContext }) {
  const { draft, brand, fabric, steps, isCustomer } = ctx;
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
  const selectionKey = JSON.stringify(selection);

  // Signed-in customer: make sure the account's draft holds exactly this
  // design (covers a guest who just signed in), then show the server's price.
  // Guests see the same formula computed here.
  const [server, setServer] = useState<ServerPrice>({ status: "loading" });
  useEffect(() => {
    if (!isCustomer || toRepick.length > 0) return;
    let cancelled = false;
    (async () => {
      const synced = await syncRemoteOptions(JSON.parse(selectionKey));
      if (!synced.ok) return synced;
      const priced = await priceDraftAction({ draftId: synced.data });
      return priced.ok ? { ok: true as const, draftId: synced.data, price: priced.data } : priced;
    })()
      .then((result) => {
        if (cancelled) return;
        setServer(result.ok ? { status: "ready", draftId: result.draftId, price: result.price } : { status: "error", error: result.error });
      })
      .catch(() => {
        if (!cancelled) setServer({ status: "error", error: "We couldn't save your order. Please try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [isCustomer, selectionKey, toRepick.length]);

  const price = server.status === "ready" ? server.price : toRepick.length === 0 ? estimateOrderFrom(t, fabric, ctx.options, selection) : null;

  const [reserving, startReserving] = useTransition();
  const [reserveError, setReserveError] = useState<string | null>(null);
  const [heldUntil, setHeldUntil] = useState<string | null>(null);
  function reserve() {
    if (server.status !== "ready") return;
    setReserveError(null);
    startReserving(async () => {
      const result = await takeSoftReservationAction({ draftId: server.draftId });
      if (!result.ok) {
        setReserveError(result.error);
        return;
      }
      setHeldUntil(
        result.data.expires_at
          ? new Date(result.data.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
          : "",
      );
    });
  }
  const name = fabricName(fabric);
  const preview = templateImage(t.slug) ?? fabric.images[0]?.url ?? null;
  const lastHref = steps.length > 0 ? "/order/customize" : "/order/preview";

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
                      <Link href={`/order/customize#step-${c.stepSlug}`} className="font-semibold underline">
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
              {price ? (
                <dl className="divide-y divide-line border-t border-line px-4 text-sm">
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-muted">Fabric (est. {formatMetres(price.yardageMetres)})</dt>
                    <dd className="font-bold text-ink">{formatPKR(price.fabricCost)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-muted">Stitching</dt>
                    <dd className="font-bold text-ink">{formatPKR(price.stitchCost)}</dd>
                  </div>
                  {price.optionsCost > 0 && (
                    <div className="flex items-center justify-between gap-3 py-3">
                      <dt className="text-muted">Style extras</dt>
                      <dd className="font-bold text-ink">{formatPKR(price.optionsCost)}</dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 py-4">
                    <dt className="font-bold text-ink">Estimated total</dt>
                    <dd className="text-base font-extrabold text-ocean">{formatPKR(price.total)}</dd>
                  </div>
                  <p className="pb-4 text-xs leading-5 text-hint">
                    Based on a standard size. The final price is recalculated from your measurements before you pay.
                  </p>
                </dl>
              ) : (
                <p className="border-t border-line px-4 py-4 text-sm text-muted">
                  {toRepick.length > 0 ? "Re-pick the options above to see the price." : "Price is shown once this template's fabric quantity is set."}
                </p>
              )}
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
                        href={`/order/customize#step-${s.slug}`}
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
        {!isCustomer ? (
          // FR-CUS-02: signing in is what saves the order to an account.
          <>
            <p className="mb-2 text-center text-sm text-muted">
              Sign in with your customer account to save this design and reserve your fabric.
            </p>
            {toRepick.length > 0 ? (
              <button type="button" disabled className={`${buttonClasses("primary")} w-full`}>
                Sign in to save
              </button>
            ) : (
              <Link href="/sign-in?next=/order/review" className={`${buttonClasses("primary")} w-full`}>
                Sign in to save
              </Link>
            )}
          </>
        ) : heldUntil !== null ? (
          <div className="w-full">
            <Alert tone="success">
              Your design is saved to your account and {price ? formatMetres(price.yardageMetres) : "your fabric"} of{" "}
              {name} is held for you{heldUntil ? ` until ${heldUntil}` : ""}. Measurements and checkout come next.
            </Alert>
          </div>
        ) : (
          <>
            {(server.status === "error" || reserveError) && (
              <div className="mb-2 w-full">
                <Alert tone="danger">{reserveError ?? (server.status === "error" ? server.error : "")}</Alert>
              </div>
            )}
            <Button
              type="button"
              onClick={reserve}
              disabled={toRepick.length > 0 || server.status !== "ready"}
              pending={reserving || (server.status === "loading" && toRepick.length === 0)}
              pendingLabel={reserving ? "Reserving…" : "Saving your design…"}
              className="w-full"
            >
              Save &amp; reserve my fabric
            </Button>
          </>
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
