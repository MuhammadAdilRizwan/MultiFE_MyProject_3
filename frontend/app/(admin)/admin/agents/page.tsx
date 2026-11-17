import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getAgentActivity, type AgentActivity } from "@multife/backend/modules/agents/agentActivity";
import { PageHeading } from "@/components/admin/list-controls";
import { Alert } from "@/components/ui/alert";
import { activeAdmin } from "@/lib/active-admin";
import { formatPKR } from "@/lib/catalog";
import { formatOrderDate } from "@/lib/order-status";

export const metadata: Metadata = { title: "Agents" };
export const dynamic = "force-dynamic";

// FR-AGT-13: every agent's customers and orders, so attribution is visible
// across the platform. Computed by fn_admin_agent_activity (admin only).
export default async function AdminAgentsPage() {
  let agents: AgentActivity[] | null = null;
  try {
    const admin = await activeAdmin();
    if (admin) agents = await getAgentActivity(admin.supabase);
  } catch (error) {
    unstable_rethrow(error);
    console.error("getAgentActivity failed:", error instanceof Error ? error.message : "unknown error");
  }

  const totals = (agents ?? []).reduce(
    (t, a) => ({ orders: t.orders + a.ordersTotal, value: t.value + a.orderValue, customers: t.customers + a.customers }),
    { orders: 0, value: 0, customers: 0 },
  );

  return (
    <div>
      <PageHeading
        title="Agents"
        text="What each agent has done: customers they look after, orders they placed and where those orders are. Make someone an agent from Users → Change role."
      />

      {!agents ? (
        <div className="mt-8">
          <Alert tone="danger">We couldn&apos;t load the agents. Please refresh.</Alert>
        </div>
      ) : agents.length === 0 ? (
        <p className="mt-10 text-center text-base text-muted">No agents yet.</p>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-3 gap-3">
            <Stat label="Agents" value={String(agents.length)} />
            <Stat label="Orders placed" value={String(totals.orders)} note={`${totals.customers} customers`} />
            <Stat label="Order value" value={formatPKR(totals.value)} note="Not counting cancelled" />
          </dl>

          <ul className="mt-6 space-y-2">
            {agents.map((a) => (
              <li key={a.agentId}>
                <Link
                  href={`/admin/agents/${a.agentId}`}
                  className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-card transition-colors hover:border-cyan-bright/60 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-ink">{a.fullName?.trim() || a.email || "Unnamed agent"}</span>
                      <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold text-ink">{a.code}</span>
                      {a.status === "suspended" && (
                        <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">Not active</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {[a.region, a.lastOrderAt ? `Last order ${formatOrderDate(a.lastOrderAt)}` : "No orders yet"].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs sm:grid-cols-6 md:text-right">
                    <Num label="Customers" value={a.customers} />
                    <Num label="Orders" value={a.ordersTotal} />
                    <Num label="Open" value={a.ordersOpen} />
                    <Num label="Delivered" value={a.ordersDelivered} />
                    <Num label="Cancelled" value={a.ordersCancelled} />
                    <div>
                      <dt className="text-muted">Value</dt>
                      <dd className="font-bold text-ink">{formatPKR(a.orderValue)}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Num({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-bold text-ink">{value}</dd>
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
