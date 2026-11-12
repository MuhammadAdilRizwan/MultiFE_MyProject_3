import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Pager, PageHeading, SearchForm } from "@/components/admin/list-controls";
import { Alert } from "@/components/ui/alert";
import { formatPKR } from "@/lib/catalog";
import { ADMIN_ORDERS_PAGE_SIZE, listAllOrders, type OrderListItem } from "@/lib/customer-orders";
import { ADMIN_ORDER_FILTERS, adminOrderFilter, formatOrderDate, isClosedWithoutDelivery, orderStatusLabel } from "@/lib/order-status";

export const metadata: Metadata = { title: "Orders" };

type Props = { searchParams: Promise<{ status?: string; q?: string; page?: string }> };

const CHANNEL: Record<string, string> = { self_serve: "Customer", agent_assisted: "Agent-assisted", agent_placed: "Agent" };

export default async function AdminOrdersPage({ searchParams }: Props) {
  const params = await searchParams;
  const filter = adminOrderFilter(params.status);
  const search = (params.q ?? "").slice(0, 60);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  let result: { orders: OrderListItem[]; total: number } | null = null;
  try {
    result = await listAllOrders({ statuses: filter.statuses, search, page });
  } catch (error) {
    unstable_rethrow(error);
    console.error("listAllOrders failed:", error instanceof Error ? error.message : "unknown error");
  }

  const href = (over: { status?: string; page?: number }) => {
    const sp = new URLSearchParams();
    const status = over.status ?? filter.key;
    if (status !== "all") sp.set("status", status);
    if (search) sp.set("q", search);
    if (over.page && over.page > 1) sp.set("page", String(over.page));
    const qs = sp.toString();
    return `/admin/orders${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <PageHeading title="Orders" text="Every order across all brands. Open one to see its design, measurements, delivery and history." />

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter by status" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {ADMIN_ORDER_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href({ status: f.key })}
              aria-current={f.key === filter.key ? "page" : undefined}
              className={`inline-flex h-9 flex-none items-center rounded-full border px-4 text-sm font-semibold transition-colors ${
                f.key === filter.key ? "border-transparent bg-mf-blue text-white shadow-blue" : "border-line bg-white text-muted hover:text-ocean"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <SearchForm action="/admin/orders" defaultValue={search} placeholder="Order number or customer name" hidden={{ status: filter.key === "all" ? undefined : filter.key }} />
      </div>

      {!result ? (
        <div className="mt-8">
          <Alert tone="danger">We couldn&apos;t load the orders. Please refresh.</Alert>
        </div>
      ) : result.orders.length === 0 ? (
        <p className="mt-10 text-center text-base text-muted">
          {search ? <>No orders match &ldquo;{search}&rdquo;.</> : "No orders here yet."}
        </p>
      ) : (
        <>
          <ul className="mt-6 space-y-2">
            {result.orders.map((o) => (
              <li key={o.number}>
                <Link
                  href={`/admin/orders/${encodeURIComponent(o.number)}`}
                  className="grid gap-2 rounded-2xl border border-line bg-white p-4 shadow-card transition-colors hover:border-cyan-bright/60 sm:grid-cols-[9rem_1fr_auto] sm:items-center sm:gap-4"
                >
                  <span>
                    <span className="block text-sm font-bold text-ink">{o.number}</span>
                    <span className="block text-xs text-muted">{formatOrderDate(o.createdAt)}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {o.customerName ?? "Customer"} <span className="font-normal text-muted">· {CHANNEL[o.channel] ?? o.channel}</span>
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {o.brandName ? `${o.brandName} · ` : ""}
                      {o.templateName}
                      {o.fabricName ? ` in ${o.fabricName}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1">
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
          <Pager page={page} total={result.total} pageSize={ADMIN_ORDERS_PAGE_SIZE} href={(p) => href({ page: p })} noun="orders" />
        </>
      )}
    </div>
  );
}
