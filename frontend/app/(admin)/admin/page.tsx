import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getDashboardStats, type DashboardStats } from "@multife/backend/modules/orders/getDashboardStats";
import { PageHeading } from "@/components/admin/list-controls";
import { Alert } from "@/components/ui/alert";
import { activeAdmin } from "@/lib/active-admin";
import { formatPKR } from "@/lib/catalog";
import { orderStatusLabel, type OrderStatus } from "@/lib/order-status";

export const metadata: Metadata = { title: "Dashboard" };

// Every status in journey order, so the breakdown reads top to bottom.
const STATUS_ORDER: OrderStatus[] = [
  "placed",
  "fabric_secured",
  "received_at_hub",
  "measurements_approved",
  "in_cutting",
  "in_stitching",
  "in_qc",
  "ready_to_ship",
  "dispatched",
  "delivered",
  "cancelled",
  "failed",
];

// FR-ADM-08: the admin's home — today's activity, cash to collect, where
// orders are, and which brands sell.
export default async function AdminDashboard() {
  let stats: DashboardStats | null = null;
  try {
    const admin = await activeAdmin();
    if (admin) stats = await getDashboardStats(admin.supabase);
  } catch (error) {
    unstable_rethrow(error);
    console.error("getDashboardStats failed:", error instanceof Error ? error.message : "unknown error");
  }

  return (
    <div>
      <PageHeading title="Dashboard" text="Orders at a glance. Days follow Pakistan time; the week starts on Monday." />

      {!stats ? (
        <div className="mt-8">
          <Alert tone="danger">We couldn&apos;t load the dashboard. Please refresh.</Alert>
        </div>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Orders today" value={String(stats.ordersToday)} />
            <Stat label="Orders this week" value={String(stats.ordersThisWeek)} />
            <Stat
              label="Cash to collect"
              value={formatPKR(stats.codOpenValue)}
              note={`${stats.codOpenCount} open cash-on-delivery ${stats.codOpenCount === 1 ? "order" : "orders"}`}
            />
            <Stat label="Cash collected" value={formatPKR(stats.codCollectedValue)} note="Delivered cash-on-delivery orders" />
          </dl>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl text-ink">Orders by status</h2>
                <span className="text-sm text-muted">{stats.ordersTotal} in total</span>
              </div>
              {stats.ordersTotal === 0 ? (
                <p className="mt-4 text-sm text-muted">No orders yet.</p>
              ) : (
                <ul className="mt-4 space-y-2.5">
                  {STATUS_ORDER.filter((s) => stats.byStatus[s]).map((s) => {
                    const n = stats.byStatus[s];
                    return (
                      <li key={s}>
                        <div className="flex justify-between gap-3 text-sm">
                          <span className="font-semibold text-ink">{orderStatusLabel(s)}</span>
                          <span className="font-bold text-ink">{n}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-line" aria-hidden="true">
                          <div
                            className={`h-2 rounded-full ${s === "cancelled" || s === "failed" ? "bg-danger/60" : "bg-mf-blue"}`}
                            style={{ width: `${Math.max(4, (n / stats.ordersTotal) * 100)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
              <h2 className="font-display text-xl text-ink">Top brands</h2>
              <p className="mt-1 text-sm text-muted">By orders, not counting cancelled ones.</p>
              {stats.topBrands.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No orders yet.</p>
              ) : (
                <ol className="mt-4 divide-y divide-line">
                  {stats.topBrands.map((b, i) => (
                    <li key={b.name} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-cream text-xs font-bold text-ink">{i + 1}</span>
                        <span className="truncate font-semibold text-ink">{b.name}</span>
                      </span>
                      <span className="flex-none text-right">
                        <span className="block font-bold text-ink">
                          {b.orders} {b.orders === 1 ? "order" : "orders"}
                        </span>
                        <span className="block text-xs text-muted">{formatPKR(b.value)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <p className="mt-6 text-sm">
            <Link href="/admin/orders?status=new" className="font-semibold text-ocean hover:underline">
              See new orders →
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-3xl border border-line bg-white p-4 shadow-card sm:p-5">
      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="mt-2 font-display text-2xl text-ink sm:text-3xl">{value}</dd>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}
