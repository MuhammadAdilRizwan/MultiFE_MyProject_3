"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { getCheckoutAction, placeOrderAction, type CheckoutSummary } from "@/app/(order)/checkout-actions";
import { ActionBar } from "@/components/order/action-bar";
import { OrderGate, type OrderContext } from "@/components/order/order-gate";
import { StepPrompt, StepSpinner } from "@/components/order/order-states";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { PageTitle } from "@/components/order/page-title";
import { useSyncedDraft } from "@/components/order/use-synced-draft";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { fabricName, formatMetres, formatPKR, priceAdjustmentLabel, templateImage } from "@/lib/catalog";
import { clearDraft } from "@/lib/order-draft";

export function CheckoutPage() {
  return <OrderGate needTemplate>{(ctx) => <Checkout ctx={ctx} />}</OrderGate>;
}

function Checkout({ ctx }: { ctx: OrderContext }) {
  const synced = useSyncedDraft(ctx);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <OrderTopBar backHref="/order/measurements" storeName={ctx.brand.name} />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <PageTitle
            label="Checkout"
            title={ctx.orderingFor ? `Confirm ${ctx.orderingFor.name}'s Order` : "Confirm Your Order"}
            subtitle={
              ctx.orderingFor
                ? "Go through everything with the customer, add their delivery details and place the order for them."
                : "Check everything once more, add your delivery details and place your order."
            }
          />
          <div className="mt-8">
            {synced.status === "guest" ? (
              <StepPrompt text="Sign in with your customer account to place your order." href="/sign-in?next=/order/checkout" action="Sign in to continue" />
            ) : synced.status === "agent-no-customer" ? (
              <StepPrompt text="To order for someone, start from that customer in your agent panel." href="/agent" action="Go to my customers" />
            ) : synced.status === "repick" ? (
              <StepPrompt text="Some of your style choices are no longer offered for this fabric. Please choose again first." href="/order/review" action="Back to review" />
            ) : synced.status === "error" ? (
              <Alert tone="danger">{synced.error}</Alert>
            ) : synced.status === "loading" ? (
              <StepSpinner />
            ) : (
              <SummaryLoader ctx={ctx} draftId={synced.draftId} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryLoader({ ctx, draftId }: { ctx: OrderContext; draftId: string }) {
  const [loaded, setLoaded] = useState<{ draftId: string; result: Awaited<ReturnType<typeof getCheckoutAction>> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCheckoutAction({ draftId })
      .then((result) => !cancelled && setLoaded({ draftId, result }))
      .catch(() => !cancelled && setLoaded({ draftId, result: { ok: false, error: "We couldn't load your order. Please try again." } }));
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  if (loaded?.draftId !== draftId) return <StepSpinner />;
  if (!loaded.result.ok) {
    return loaded.result.error === "Confirm your measurements first." ? (
      <StepPrompt text="Add and confirm your measurements before placing the order." href="/order/measurements" action="Add measurements" />
    ) : (
      <Alert tone="danger">{loaded.result.error}</Alert>
    );
  }
  return <CheckoutForm ctx={ctx} draftId={draftId} summary={loaded.result.data} />;
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

function CheckoutForm({ ctx, draftId, summary }: { ctx: OrderContext; draftId: string; summary: CheckoutSummary }) {
  const router = useRouter();
  const t = ctx.template!;
  const name = fabricName(ctx.fabric);
  const preview = templateImage(t.slug) ?? ctx.fabric.images[0]?.url ?? null;
  const { pricing } = summary;

  const [delivery, setDelivery] = useState({
    fullName: summary.contact.fullName,
    phone: summary.contact.phone,
    addressLine: "",
    city: "",
  });
  // One key per checkout visit: a retried tap can't create a second order.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [placing, startPlacing] = useTransition();

  const set = (field: keyof typeof delivery) => (e: { target: { value: string } }) =>
    setDelivery((d) => ({ ...d, [field]: e.target.value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startPlacing(async () => {
      const result = await placeOrderAction({ draftId, idempotencyKey, delivery });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      clearDraft();
      const base = result.data.mode === "agent" ? "/agent/orders" : "/account/orders";
      router.replace(`${base}/${encodeURIComponent(result.data.number)}?placed=1`);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start lg:gap-8">
      <aside className="overflow-hidden rounded-3xl border border-line bg-white shadow-card lg:sticky lg:top-24">
        <div className="relative flex aspect-[4/3] items-center justify-center bg-cream">
          {preview ? (
            <Image src={preview} alt={`${t.name} preview`} fill sizes="(min-width: 1024px) 352px, 100vw" className="object-cover" />
          ) : (
            <span aria-hidden="true" className="font-display text-8xl text-hint">
              {t.name.charAt(0)}
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-4 pb-4 pt-12 text-white">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">{ctx.brand.name}</p>
            <p className="mt-1 text-sm font-semibold">
              {name} · {t.name}
            </p>
          </div>
        </div>
        <dl className="divide-y divide-line px-4 text-sm">
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-muted">Fabric ({formatMetres(pricing.yardageMetres)})</dt>
            <dd className="font-bold text-ink">{formatPKR(pricing.fabricCost)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-muted">Stitching</dt>
            <dd className="font-bold text-ink">{formatPKR(pricing.stitchCost)}</dd>
          </div>
          {pricing.optionsCost > 0 && (
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-muted">Style extras</dt>
              <dd className="font-bold text-ink">{formatPKR(pricing.optionsCost)}</dd>
            </div>
          )}
          {pricing.adjustment !== 0 && (
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-muted">{priceAdjustmentLabel(pricing.adjustment)}</dt>
              <dd className={`font-bold ${pricing.adjustment < 0 ? "text-success" : "text-ink"}`}>
                {pricing.adjustment < 0 ? "−" : "+"}
                {formatPKR(Math.abs(pricing.adjustment))}
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-muted">Delivery</dt>
            <dd className="font-bold text-success">Free</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-4">
            <dt className="font-bold text-ink">Total</dt>
            <dd className="text-lg font-extrabold text-ocean">{formatPKR(pricing.total)}</dd>
          </div>
        </dl>
        <p className="border-t border-line px-4 py-3 text-xs leading-5 text-muted">
          Priced for your measurements. Estimated delivery{" "}
          <span className="font-semibold text-ink">{formatDate(summary.estDeliveryDate)}</span>.
        </p>
      </aside>

      <div className="space-y-6">
        <Section title={summary.mode === "agent" ? "Measurements" : "Your measurements"} editHref="/order/measurements">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            {summary.measurements.map((m) => (
              <div key={m.key} className="rounded-xl bg-cream/70 px-3 py-2">
                <dt className="text-xs text-muted">{m.label}</dt>
                <dd className="font-bold text-ink">
                  {m.value} {m.unit}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title={`${summary.mode === "agent" ? "Design" : "Your design"} · ${summary.options.length} choices`} editHref="/order/customize">
          <ul className="flex flex-wrap gap-2">
            {summary.options.map((o) => (
              <li key={o.group} className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink">
                <span className="text-muted">{o.group_label}:</span> <span className="font-semibold">{o.label}</span>
                {o.price_delta > 0 && <span className="font-semibold text-ocean"> +{formatPKR(o.price_delta)}</span>}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Delivery details">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="fullName" label="Full name" autoComplete="name" required maxLength={80} value={delivery.fullName} onChange={set("fullName")} />
            <TextField id="phone" label="Phone number" type="tel" autoComplete="tel" inputMode="tel" required maxLength={20} placeholder="03XX XXXXXXX" value={delivery.phone} onChange={set("phone")} />
            <div className="sm:col-span-2">
              <TextField id="addressLine" label="Address" autoComplete="street-address" required maxLength={200} placeholder="House, street, area" value={delivery.addressLine} onChange={set("addressLine")} />
            </div>
            <TextField id="city" label="City" autoComplete="address-level2" required maxLength={60} value={delivery.city} onChange={set("city")} />
          </div>
        </Section>

        <Section title="Payment">
          <div className="flex items-start gap-3 rounded-2xl border-2 border-cyan-bright bg-cyan-bright/5 p-4">
            <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 border-ocean">
              <span className="h-2.5 w-2.5 rounded-full bg-ocean" />
            </span>
            <div>
              <p className="text-sm font-bold text-ink">Cash on delivery</p>
              <p className="mt-0.5 text-sm text-muted">{summary.mode === "agent" ? "The customer pays" : "Pay"} {formatPKR(pricing.total)} in cash when the outfit arrives. Online payment is coming soon.</p>
            </div>
          </div>
        </Section>
      </div>

      <ActionBar backHref="/order/measurements" backLabel="Back to measurements">
        {error && (
          <div className="mb-2 w-full">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        <Button type="submit" pending={placing} pendingLabel="Placing your order…" className="w-full">
          Place order · {formatPKR(pricing.total)}
        </Button>
      </ActionBar>
    </form>
  );
}

function Section({ title, editHref, children }: { title: string; editHref?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-white/80 p-5 shadow-card backdrop-blur-xl sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl text-ink sm:text-2xl">{title}</h2>
        {editHref && (
          <Link href={editHref} className="text-sm font-semibold text-ocean hover:underline">
            Edit
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
