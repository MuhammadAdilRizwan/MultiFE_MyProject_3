import Image from "next/image";
import type { ReactNode } from "react";
import { BackLink } from "@/components/layout/back-link";
import { Alert } from "@/components/ui/alert";
import { HeadingRule } from "@/components/ui/heading";
import { formatMetres, formatPKR, priceAdjustmentLabel } from "@/lib/catalog";
import type { OrderDetail } from "@/lib/customer-orders";
import { MILESTONES, formatOrderDate, isClosedWithoutDelivery, milestoneIndex, orderStatusLabel } from "@/lib/order-status";
import { formatPhone } from "@/lib/phone";

const measurementLabel = (key: string) => {
  const text = key.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// One order's progress, price, design, measurements and history — for the
// customer (/account/orders) or the agent who placed it (/agent/orders).
export function OrderDetailView({
  order,
  placed,
  audience,
}: {
  order: OrderDetail;
  placed: boolean;
  audience: "customer" | "agent";
}) {
  const reached = milestoneIndex(order.status);
  const closed = isClosedWithoutDelivery(order.status);
  const isCod = order.paymentMethod === "cash_on_delivery";
  const adjustment = Math.round((order.total - order.fabricCost - order.stitchCost - order.optionsCost) * 100) / 100;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <BackLink href={audience === "agent" ? "/agent/orders" : "/account/orders"} label="All orders" />

      {placed && (
        <div className="mt-4">
          <Alert tone="success">
            {audience === "agent" ? (
              <>
                Order <span className="font-bold">{order.number}</span> has been placed for{" "}
                <span className="font-bold">{order.customerName ?? "your customer"}</span>. It will be delivered by{" "}
              </>
            ) : (
              <>
                Thank you! Your order <span className="font-bold">{order.number}</span> has been placed. We&apos;ll stitch it
                to your measurements and deliver it by{" "}
              </>
            )}
            <span className="font-bold">{order.estDeliveryDate ? formatOrderDate(order.estDeliveryDate) : "the estimated date"}</span>.
          </Alert>
        </div>
      )}

      <div className="mt-6 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean">Order {order.number}</p>
        <h1 className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl">
          {order.templateName}
          {order.fabricName ? ` in ${order.fabricName}` : ""}
        </h1>
        <HeadingRule className="mt-3 sm:mx-0" />
        <p className="mt-3 text-sm text-muted">
          {order.brandName ? `${order.brandName} · ` : ""}Ordered {formatOrderDate(order.createdAt)}
        </p>
      </div>

      <section aria-label="Order progress" className="mt-8 rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
        {closed ? (
          <p className="text-base font-bold text-danger">{orderStatusLabel(order.status)}</p>
        ) : (
          <>
            <ol className="grid grid-cols-5 gap-1 sm:gap-2">
              {MILESTONES.map((m, i) => (
                <li key={m.key} className="flex flex-col items-center gap-2 text-center">
                  <span className={`h-2 w-full rounded-full ${i <= reached ? "bg-mf-blue" : "bg-line"}`} />
                  <span className={`text-[11px] font-semibold sm:text-xs ${i <= reached ? "text-ink" : "text-hint"}`}>{m.label}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-muted">
              Now: <span className="font-semibold text-ink">{orderStatusLabel(order.status)}</span>
              {order.estDeliveryDate && order.status !== "delivered" && (
                <>
                  {" "}· Estimated delivery <span className="font-semibold text-ink">{formatOrderDate(order.estDeliveryDate)}</span>
                </>
              )}
            </p>
          </>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-start">
        <aside className="space-y-6">
          <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
            {order.fabricImage && (
              <div className="relative aspect-[4/3] bg-cream">
                <Image src={order.fabricImage} alt={`${order.fabricName ?? "Fabric"} swatch`} fill sizes="(min-width: 1024px) 320px, 100vw" className="object-cover" />
              </div>
            )}
            <dl className="divide-y divide-line px-4 text-sm">
              <Row label={`Fabric${order.yardageMetres ? ` (${formatMetres(order.yardageMetres)})` : ""}`} value={formatPKR(order.fabricCost)} />
              <Row label="Stitching" value={formatPKR(order.stitchCost)} />
              {order.optionsCost > 0 && <Row label="Style extras" value={formatPKR(order.optionsCost)} />}
              {adjustment !== 0 && (
                <Row
                  label={priceAdjustmentLabel(adjustment)}
                  value={`${adjustment < 0 ? "−" : "+"}${formatPKR(Math.abs(adjustment))}`}
                />
              )}
              <div className="flex items-center justify-between gap-3 py-4">
                <dt className="font-bold text-ink">Total</dt>
                <dd className="text-lg font-extrabold text-ocean">{formatPKR(order.total)}</dd>
              </div>
            </dl>
            <p className="border-t border-line px-4 py-3 text-sm text-muted">
              {isCod
                ? order.paymentStatus === "paid"
                  ? "Paid on delivery."
                  : "Cash on delivery — pay when your outfit arrives."
                : order.paymentStatus === "paid"
                  ? "Paid online."
                  : "Payment pending."}
            </p>
          </div>

          {audience === "agent" && (
            <Card title="Customer">
              <p className="text-sm leading-6 text-ink">
                <span className="font-semibold">{order.customerName ?? "Customer"}</span>
                {order.customerPhone && (
                  <>
                    <br />
                    <span className="text-muted">{formatPhone(order.customerPhone)}</span>
                  </>
                )}
              </p>
            </Card>
          )}

          {order.delivery && (
            <Card title="Delivering to">
              <p className="text-sm leading-6 text-ink">
                <span className="font-semibold">{order.delivery.full_name}</span>
                <br />
                {order.delivery.address_line}
                <br />
                {order.delivery.city}
                <br />
                <span className="text-muted">{order.delivery.phone}</span>
              </p>
            </Card>
          )}
        </aside>

        <div className="space-y-6">
          <Card title={`Your design · ${order.options.length} choices`}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {order.options.map((o) => (
                <li key={o.group} className="rounded-2xl bg-cream/70 px-3 py-2 text-sm">
                  <span className="block text-xs text-muted">{o.group_label}</span>
                  <span className="font-semibold text-ink">{o.label}</span>
                  {o.price_delta > 0 && <span className="font-semibold text-ocean"> +{formatPKR(o.price_delta)}</span>}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Measurements">
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {Object.entries(order.measurements).map(([key, value]) => (
                <div key={key} className="rounded-xl bg-cream/70 px-3 py-2">
                  <dt className="text-xs text-muted">{measurementLabel(key)}</dt>
                  <dd className="font-bold text-ink">{value} cm</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs leading-5 text-muted">Our tailor checks these before cutting and will contact you if anything needs a change.</p>
          </Card>

          {order.history.length > 0 && (
            <Card title="History">
              <ol className="space-y-2 text-sm">
                {order.history.map((h) => (
                  <li key={`${h.status}-${h.at}`} className="flex justify-between gap-3">
                    <span className="font-semibold text-ink">{orderStatusLabel(h.status)}</span>
                    <time dateTime={h.at} className="text-muted">
                      {new Date(h.at).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </time>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-bold text-ink">{value}</dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
      <h2 className="mb-4 font-display text-xl text-ink">{title}</h2>
      {children}
    </section>
  );
}
