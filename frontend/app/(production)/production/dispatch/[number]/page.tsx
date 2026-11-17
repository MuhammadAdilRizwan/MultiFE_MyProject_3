import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { BackLink } from "@/components/layout/back-link";
import { DeliveryActions } from "@/components/production/delivery-actions";
import { Alert } from "@/components/ui/alert";
import { formatPKR } from "@/lib/catalog";
import { getDispatchOrder } from "@/lib/dispatch-orders";
import { formatOrderDate, orderStatusLabel } from "@/lib/order-status";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Deliver ${decodeURIComponent((await params).number)}` };
}

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// One order for dispatch staff (FR-FUL-01..05): where it goes, what to
// collect, and the delivery step.
export default async function DispatchOrderPage({ params }: Props) {
  const number = decodeURIComponent((await params).number);
  if (!/^MF-\d{4}-\d{6}$/.test(number)) notFound();

  const profile = await getCurrentProfile(await createClient());
  if (profile?.role !== "dispatch") redirect("/production");

  const order = await getDispatchOrder(number).catch((error: unknown) => {
    console.error("getDispatchOrder failed:", error instanceof Error ? error.message : "unknown error");
    return undefined;
  });
  if (order === null) notFound();
  if (order === undefined) return <Alert tone="danger">We couldn&apos;t load this order. Please refresh to try again.</Alert>;

  const name = order.address?.full_name || order.customerName || "Customer";
  const phone = order.address?.phone || order.customerPhone;

  return (
    <div>
      <BackLink href="/production" label="Deliveries" />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-ocean">Delivery</p>
          <h1 className="mt-1 font-display text-3xl leading-tight text-ink sm:text-4xl">{order.number}</h1>
          <p className="mt-1 text-base text-muted">{[order.templateName, order.fabricName].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="rounded-full bg-cyan-bright/10 px-3 py-1.5 text-xs font-bold text-ocean">
          {order.shipmentStatus === "delivery_failed" ? "Delivery failed" : orderStatusLabel(order.status)}
        </span>
      </div>

      <div className="mt-6">
        <DeliveryActions
          orderId={order.id}
          status={order.status}
          shipmentStatus={order.shipmentStatus}
          courier={order.courier}
          trackingRef={order.trackingRef}
          fulfilmentMethod={order.fulfilmentMethod}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title={order.fulfilmentMethod === "collection" ? "Collected by" : "Deliver to"}>
          <p className="text-base font-bold text-ink">{name}</p>
          {phone && (
            <p className="mt-1 text-sm">
              <a href={`tel:${phone}`} className="font-semibold text-ocean hover:underline">
                {formatPhone(phone) || phone}
              </a>
            </p>
          )}
          {order.fulfilmentMethod === "collection" ? (
            <p className="mt-2 text-sm leading-6 text-ink">Collects from the workshop. Check their name and order number at handover.</p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-ink">
              {order.address?.address_line ?? "No address on the order — call the customer."}
              {order.address?.city && <span className="block">{order.address.city}</span>}
            </p>
          )}
          {order.cashToCollect !== null && order.status !== "delivered" && (
            <div className="mt-4">
              <Alert tone="warning">
                Cash on delivery: {order.fulfilmentMethod === "collection" ? "take" : "the courier collects"}{" "}
                <span className="font-bold">{formatPKR(order.cashToCollect)}</span>{order.fulfilmentMethod === "collection" ? " at handover" : ""}.
              </Alert>
            </div>
          )}
        </Section>

        <Section title="Shipment">
          <dl className="space-y-2 text-sm">
            <Row label="Due" value={order.dueDate ? formatOrderDate(order.dueDate) : "—"} />
            <Row label="Courier" value={order.courier ?? "—"} />
            <Row label="Tracking" value={order.trackingRef ?? "—"} />
            {order.dispatchedAt && <Row label="Sent" value={formatWhen(order.dispatchedAt)} />}
            {order.deliveredAt && <Row label="Delivered" value={formatWhen(order.deliveredAt)} />}
          </dl>
          {order.failedAttempts > 0 && (
            <p className="mt-3 text-xs leading-5 text-warning">
              {order.failedAttempts} failed {order.failedAttempts === 1 ? "attempt" : "attempts"}
              {order.lastFailureReason && ` — last: “${order.lastFailureReason}”`}
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="break-all text-right font-bold text-ink">{value}</dd>
    </div>
  );
}
