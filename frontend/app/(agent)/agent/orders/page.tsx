import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { summariseActivity } from "@multife/backend/modules/agents/summariseActivity";
import { Alert } from "@/components/ui/alert";
import { formatPKR } from "@/lib/catalog";
import { listMyOrders, type OrderListItem } from "@/lib/customer-orders";
import { formatOrderDate, isClosedWithoutDelivery, orderStatusLabel } from "@/lib/order-status";

export const metadata: Metadata = { title: "Orders & activity" };

// FR-AGT-11: the orders this agent placed for their customers, with counts.
export default async function AgentOrdersPage() {
  let orders: OrderListItem[] | null = null;
  try {
    orders = await listMyOrders("agent");
  } catch (error) {
    console.error("agent listMyOrders failed:", error instanceof Error ? error.message : "unknown error");
  }

  const summary = orders ? summariseActivity(orders) : null;

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean">Agent panel</p>
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">Orders &amp; activity</h1>
        <p className="text-sm text-muted">Every order you&apos;ve placed for your customers, and where each one is now.</p>
      </div>

      {orders === null || summary === null ? (
        <div className="mt-8">
          <Alert tone="danger">We couldn&apos;t load your orders. Please refresh to try again.</Alert>
        </div>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Orders placed" value={String(summary.placed)} />
            <Stat label="In production" value={String(summary.inProduction)} />
            <Stat label="Delivered" value={String(summary.delivered)} />
            <Stat label="Cancelled" value={String(summary.cancelled)} />
            <Stat label="Order value" value={formatPKR(summary.activeValue)} wide />
          </dl>

          {orders.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-line bg-white px-6 py-12 text-center">
              <p className="text-base font-semibold text-ink">No orders yet</p>
              <p className="mt-1 text-sm text-muted">Start an order from one of your customers to see it here.</p>
              <Link href="/agent" className="mt-4 inline-flex text-sm font-semibold text-ocean hover:underline">
                Go to my customers
              </Link>
            </div>
          ) : (
            <ul className="mt-6 space-y-3">
              {orders.map((o) => (
                <li key={o.number}>
                  <Link
                    href={`/agent/orders/${encodeURIComponent(o.number)}`}
                    className="flex items-center gap-4 rounded-3xl border border-line bg-white p-3 shadow-card transition-colors hover:border-cyan-bright/60 sm:p-4"
                  >
                    <span className="relative flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-2xl bg-cream">
                      {o.fabricImage ? (
                        <Image src={o.fabricImage} alt="" fill sizes="64px" className="object-cover" />
                      ) : (
                        <span aria-hidden="true" className="font-display text-2xl text-hint">
                          {o.templateName.charAt(0)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">
                        {o.customerName ?? "Customer"} · {o.templateName}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted">
                        {o.number} · {o.brandName ? `${o.brandName} · ` : ""}
                        {formatOrderDate(o.createdAt)}
                      </span>
                    </span>
                    <span className="flex flex-none flex-col items-end gap-1 text-right">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          isClosedWithoutDelivery(o.status) ? "bg-danger-soft text-danger" : "bg-cyan-bright/10 text-ocean"
                        }`}
                      >
                        {orderStatusLabel(o.status)}
                      </span>
                      <span className="text-sm font-bold text-ink">{formatPKR(o.total)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-2xl border border-line bg-white p-4 shadow-card ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl text-ink">{value}</dd>
    </div>
  );
}
