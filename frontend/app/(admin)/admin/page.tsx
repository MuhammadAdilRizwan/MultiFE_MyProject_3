import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getDashboardStats, type DashboardStats } from "@multife/backend/modules/orders/getDashboardStats";
import { PageHeading } from "@/components/admin/list-controls";
import { Alert } from "@/components/ui/alert";
import { activeAdmin } from "@/lib/active-admin";
import { getProductionAttention, type Attention } from "@/lib/admin-production";
import { formatPKR } from "@/lib/catalog";
import { formatOrderDate, orderStatusLabel, type OrderStatus } from "@/lib/order-status";

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
  let attention: Attention | null = null;
  try {
    const admin = await activeAdmin();
    if (admin) {
      [stats, attention] = await Promise.all([
        getDashboardStats(admin.supabase),
        getProductionAttention().catch((error: unknown) => {
          console.error("getProductionAttention failed:", error instanceof Error ? error.message : "unknown error");
          return null;
        }),
      ]);
    }
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

          {attention && <NeedsAttention attention={attention} />}

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

// FR-PRD-08 and the production to-dos only an admin can clear.
function NeedsAttention({ attention }: { attention: Attention }) {
  const { overdue, overdueCount, unassignedCount, remakesWaiting, correctionsDeclined, failedEmails, openDisputes } = attention;
  if (overdueCount === 0 && unassignedCount === 0 && remakesWaiting.length === 0 && correctionsDeclined.length === 0 && failedEmails === 0 && openDisputes.length === 0) {
    return (
      <p className="mt-6 rounded-3xl border border-success/25 bg-success-soft px-5 py-4 text-sm font-semibold text-success">
        Nothing needs attention: no overdue orders, every job is assigned, no remakes, disputes or declined measurements, no failed emails.
      </p>
    );
  }
  return (
    <section aria-labelledby="attention-heading" className="mt-6 rounded-3xl border border-danger/25 bg-white p-5 shadow-card sm:p-6">
      <h2 id="attention-heading" className="font-display text-xl text-ink">
        Needs attention
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div>
          <p className="text-sm font-bold text-danger">
            {overdueCount} overdue {overdueCount === 1 ? "order" : "orders"}
          </p>
          <p className="text-xs text-muted">Past the delivery date and not delivered.</p>
          {overdue.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {overdue.map((o) => (
                <li key={o.number}>
                  <Link href={`/admin/orders/${o.number}`} className="font-semibold text-ocean hover:underline">
                    {o.number}
                  </Link>{" "}
                  <span className="text-muted">
                    · due {formatOrderDate(o.dueDate)} · {orderStatusLabel(o.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {overdueCount > overdue.length && (
            <Link href="/admin/orders?status=overdue" className="mt-1 inline-block text-sm font-semibold text-ocean hover:underline">
              See all {overdueCount} →
            </Link>
          )}
        </div>
        <div>
          <p className={`text-sm font-bold ${unassignedCount ? "text-warning" : "text-ink"}`}>
            {unassignedCount} {unassignedCount === 1 ? "job" : "jobs"} not assigned
          </p>
          <p className="text-xs text-muted">Open an order and assign a tailor in the Production card.</p>
          {unassignedCount > 0 && (
            <Link href="/admin/orders?status=open" className="mt-1 inline-block text-sm font-semibold text-ocean hover:underline">
              Open orders →
            </Link>
          )}
        </div>
        <div>
          <p className={`text-sm font-bold ${remakesWaiting.length ? "text-danger" : "text-ink"}`}>
            {remakesWaiting.length} {remakesWaiting.length === 1 ? "remake" : "remakes"} waiting
          </p>
          <p className="text-xs text-muted">Failed quality check and can&apos;t be fixed.</p>
          <OrderLinks numbers={remakesWaiting.map((r) => r.number)} />
        </div>
        <div>
          <p className={`text-sm font-bold ${correctionsDeclined.length ? "text-danger" : "text-ink"}`}>
            {correctionsDeclined.length} measurement {correctionsDeclined.length === 1 ? "change" : "changes"} declined
          </p>
          <p className="text-xs text-muted">The customer disagreed with the tailor. Agree the measurements with them.</p>
          <OrderLinks numbers={correctionsDeclined.map((r) => r.number)} />
        </div>
        <div>
          <p className={`text-sm font-bold ${openDisputes.length ? "text-danger" : "text-ink"}`}>
            {openDisputes.length} open {openDisputes.length === 1 ? "dispute" : "disputes"}
          </p>
          <p className="text-xs text-muted">A customer complaint you&apos;re handling.</p>
          <OrderLinks numbers={openDisputes.map((d) => d.number)} />
        </div>
        <div>
          <p className={`text-sm font-bold ${failedEmails ? "text-danger" : "text-ink"}`}>
            {failedEmails} failed {failedEmails === 1 ? "email" : "emails"}
          </p>
          <p className="text-xs text-muted">Gave up after 5 attempts.</p>
          {failedEmails > 0 && (
            <Link href="/admin/notifications" className="mt-1 inline-block text-sm font-semibold text-ocean hover:underline">
              Notifications →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function OrderLinks({ numbers }: { numbers: string[] }) {
  if (numbers.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {numbers.slice(0, 5).map((n) => (
        <li key={n}>
          <Link href={`/admin/orders/${n}`} className="font-semibold text-ocean hover:underline">
            {n}
          </Link>
        </li>
      ))}
    </ul>
  );
}
