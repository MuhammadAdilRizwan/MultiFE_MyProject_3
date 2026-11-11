import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageTitle } from "@/components/order/page-title";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { formatPKR } from "@/lib/catalog";
import { listMyOrders, type OrderListItem } from "@/lib/customer-orders";
import { formatOrderDate, isClosedWithoutDelivery, orderStatusLabel } from "@/lib/order-status";

export const metadata: Metadata = { title: "My orders" };

export default async function OrdersPage() {
  let orders: OrderListItem[] | null = null;
  try {
    orders = await listMyOrders();
  } catch (error) {
    console.error("listMyOrders failed:", error instanceof Error ? error.message : "unknown error");
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <PageTitle label="Your account" title="My Orders" subtitle="Every outfit you've ordered, and where it is now." />

      {orders === null ? (
        <div className="mx-auto mt-10 max-w-md">
          <Alert tone="danger">We couldn&apos;t load your orders. Please refresh to try again.</Alert>
        </div>
      ) : orders.length === 0 ? (
        <div className="mx-auto mt-10 max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-card">
          <p className="text-base font-semibold text-ink">You haven&apos;t placed an order yet.</p>
          <p className="mt-2 text-sm text-muted">Pick a brand and a fabric to design your first outfit.</p>
          <Link href="/brands" className={`${buttonClasses("primary")} mt-6 w-full`}>
            Browse brands
          </Link>
        </div>
      ) : (
        <ul className="mt-10 space-y-3">
          {orders.map((o) => (
            <li key={o.number}>
              <Link
                href={`/account/orders/${encodeURIComponent(o.number)}`}
                className="flex items-center gap-4 rounded-3xl border border-line bg-white p-3 shadow-card transition-colors hover:border-cyan-bright/60 sm:p-4"
              >
                <span className="relative flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-2xl bg-cream sm:h-20 sm:w-20">
                  {o.fabricImage ? (
                    <Image src={o.fabricImage} alt="" fill sizes="80px" className="object-cover" />
                  ) : (
                    <span aria-hidden="true" className="font-display text-2xl text-hint">
                      {o.templateName.charAt(0)}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-muted">{o.number}</span>
                  <span className="mt-0.5 block truncate text-base font-bold text-ink">
                    {o.templateName}
                    {o.fabricName ? ` · ${o.fabricName}` : ""}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted">
                    {o.brandName ? `${o.brandName} · ` : ""}Ordered {formatOrderDate(o.createdAt)}
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
    </div>
  );
}
