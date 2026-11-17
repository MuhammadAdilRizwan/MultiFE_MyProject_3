import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { HeadingRule } from "@/components/ui/heading";
import { formatPKR } from "@/lib/catalog";
import { logMessage } from "@/lib/describe-error";
import { listDispatchOrders, type DispatchOrder } from "@/lib/dispatch-orders";
import { formatOrderDate, todayInPakistan } from "@/lib/order-status";

const VIEWS = [
  { key: "ship", label: "Ready to ship" },
  { key: "out", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

// Dispatch staff's home (FR-FUL-01..05): outfits that passed QC, those out
// with a courier (including failed attempts waiting to go again), and recent
// deliveries.
export async function DispatchQueue({ view: requested }: { view?: string }) {
  const view: ViewKey = VIEWS.some((v) => v.key === requested) ? (requested as ViewKey) : "ship";
  const orders = await listDispatchOrders().catch((error: unknown) => {
    console.error("listDispatchOrders failed:", logMessage(error));
    return null;
  });

  const lists = orders ? { ship: orders.toShip, out: orders.out, delivered: orders.delivered } : null;
  const shown = lists ? lists[view] : [];
  const failed = orders?.out.filter((o) => o.shipmentStatus === "delivery_failed").length ?? 0;
  const today = todayInPakistan();

  return (
    <div>
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">Deliveries</h1>
        <HeadingRule align="left" className="mt-4" />
        <p className="mt-4 text-base leading-7 text-muted">
          Outfits that passed quality check. Pack each one, hand it to a courier with the tracking number, then confirm
          delivery.
        </p>
      </div>

      {!lists ? (
        <div className="mt-8">
          <Alert tone="danger">We couldn&apos;t load the deliveries. Please refresh to try again.</Alert>
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-2">
            {VIEWS.map((v) => {
              const active = v.key === view;
              return (
                <Link
                  key={v.key}
                  href={v.key === "ship" ? "/production" : `/production?view=${v.key}`}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors ${
                    active ? "border-transparent bg-mf-blue text-white shadow-blue" : "border-line bg-white text-ink hover:border-cyan-bright/60"
                  }`}
                >
                  {v.label}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/20" : "bg-cream text-muted"}`}>{lists[v.key].length}</span>
                </Link>
              );
            })}
            {failed > 0 && (
              <span className="rounded-full bg-danger-soft px-3 py-1.5 text-xs font-bold text-danger">
                {failed} to send again
              </span>
            )}
          </div>

          {shown.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
              <p className="text-base font-semibold text-ink">
                {view === "ship" ? "Nothing waiting to ship" : view === "out" ? "Nothing out for delivery" : "No deliveries yet"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {view === "ship" ? "Outfits appear here once they pass quality check." : "Orders move here as you send and deliver them."}
              </p>
            </div>
          ) : (
            <ul className="mt-6 grid gap-3 md:grid-cols-2">
              {shown.map((o) => (
                <DispatchCard key={o.id} order={o} overdue={!!o.dueDate && o.dueDate < today && o.status !== "delivered"} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function DispatchCard({ order, overdue }: { order: DispatchOrder; overdue: boolean }) {
  const failed = order.shipmentStatus === "delivery_failed";
  return (
    <li>
      <Link
        href={`/production/dispatch/${encodeURIComponent(order.number)}`}
        className="block h-full rounded-3xl border border-line bg-white p-4 shadow-card transition-colors hover:border-cyan-bright/60"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-extrabold tracking-tight text-ink">{order.number}</span>
          {order.fulfilmentMethod === "collection" && (
            <span className="rounded-full bg-cyan-bright/10 px-2 py-0.5 text-[11px] font-bold text-ocean">
              {order.shipmentStatus === "ready_for_collection" ? "Waiting for pickup" : "Collection"}
            </span>
          )}
          {failed && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">Delivery failed</span>}
          {overdue && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-bold text-warning">Overdue</span>}
          {order.cashToCollect !== null && order.status !== "delivered" && (
            <span className="rounded-full bg-orange/15 px-2 py-0.5 text-[11px] font-bold text-orange">Collect {formatPKR(order.cashToCollect)}</span>
          )}
        </span>
        <span className="mt-1 block truncate text-sm font-semibold text-ink">
          {order.address?.full_name || order.customerName || "Customer"}
          {order.address?.city && <span className="font-normal text-muted"> · {order.address.city}</span>}
        </span>
        <span className="block truncate text-xs text-muted">
          {[order.templateName, order.fabricName].filter(Boolean).join(" · ")}
        </span>
        <span className="mt-2 block text-xs text-muted">
          {order.status === "delivered" && order.deliveredAt
            ? `Delivered ${formatOrderDate(order.deliveredAt)}`
            : order.fulfilmentMethod === "collection"
              ? "Customer collects from the workshop"
              : order.courier
              ? `${order.courier} · ${order.trackingRef}`
              : order.dueDate
                ? `Due ${formatOrderDate(order.dueDate)}`
                : null}
        </span>
      </Link>
    </li>
  );
}
