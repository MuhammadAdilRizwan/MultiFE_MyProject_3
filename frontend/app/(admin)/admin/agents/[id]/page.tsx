import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgentActivity } from "@multife/backend/modules/agents/agentActivity";
import { Pager } from "@/components/admin/list-controls";
import { Alert } from "@/components/ui/alert";
import { HeadingRule } from "@/components/ui/heading";
import { activeAdmin } from "@/lib/active-admin";
import { formatPKR } from "@/lib/catalog";
import { ADMIN_ORDERS_PAGE_SIZE, listAllOrders } from "@/lib/customer-orders";
import { formatOrderDate, isClosedWithoutDelivery, orderStatusLabel } from "@/lib/order-status";
import { formatPhone } from "@/lib/phone";

export const metadata: Metadata = { title: "Agent" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> };

// FR-AGT-13: one agent's attribution — their numbers, the orders they placed
// and the customers assigned to them. Admin session only.
export default async function AdminAgentPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const page = Math.max(1, Math.floor(Number((await searchParams).page) || 1));

  const admin = await activeAdmin();
  if (!admin) notFound();
  const agent = (await getAgentActivity(admin.supabase)).find((a) => a.agentId === id);
  if (!agent) notFound();

  const [orders, customers] = await Promise.all([
    listAllOrders({ agentId: agent.profileId, page }).catch((error: unknown) => {
      console.error("agent orders failed:", error instanceof Error ? error.message : "unknown error");
      return null;
    }),
    admin.supabase
      .from("agent_customers")
      .select("id, acquired_at, customer:profiles!agent_customers_customer_id_fkey(full_name, email, phone, is_provisional)")
      .eq("agent_id", agent.agentId)
      .order("acquired_at", { ascending: false }),
  ]);
  const customerRows = (customers.data ?? []) as unknown as {
    id: string;
    acquired_at: string;
    customer: { full_name: string | null; email: string | null; phone: string | null; is_provisional: boolean } | null;
  }[];
  const name = agent.fullName?.trim() || agent.email || "Unnamed agent";

  return (
    <div>
      <Link href="/admin/agents" className="text-sm font-semibold text-ocean hover:underline">
        ← All agents
      </Link>
      <div className="mt-3 max-w-2xl">
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{name}</h1>
        <HeadingRule align="left" className="mt-4" />
        <p className="mt-4 text-base text-muted">
          {[agent.code, agent.region, agent.email, agent.status === "suspended" ? "Not active" : null].filter(Boolean).join(" · ")}
        </p>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Customers" value={String(agent.customers)} />
        <Stat label="Orders" value={String(agent.ordersTotal)} note={`${agent.ordersOpen} open · ${agent.ordersDelivered} delivered · ${agent.ordersCancelled} cancelled`} />
        <Stat label="Order value" value={formatPKR(agent.orderValue)} note="Not counting cancelled" />
        <Stat label="Visits done" value={String(agent.visitsDone)} note="Measurement visits recorded" />
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-start">
        <section className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
          <h2 className="font-display text-xl text-ink">Orders placed</h2>
          {!orders ? (
            <div className="mt-4">
              <Alert tone="danger">We couldn&apos;t load the orders. Please refresh.</Alert>
            </div>
          ) : orders.orders.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No orders placed yet.</p>
          ) : (
            <>
              <ul className="mt-4 divide-y divide-line">
                {orders.orders.map((o) => (
                  <li key={o.number}>
                    <Link href={`/admin/orders/${o.number}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm hover:text-ocean">
                      <span className="min-w-0">
                        <span className="font-bold text-ink">{o.number}</span>
                        <span className="block truncate text-xs text-muted">
                          {[o.customerName, o.templateName, o.brandName].filter(Boolean).join(" · ")} · {formatOrderDate(o.createdAt)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${isClosedWithoutDelivery(o.status) ? "bg-danger-soft text-danger" : "bg-cyan-bright/10 text-ocean"}`}>
                          {orderStatusLabel(o.status)}
                        </span>
                        <span className="font-semibold text-ink">{formatPKR(o.total)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Pager
                page={page}
                total={orders.total}
                pageSize={ADMIN_ORDERS_PAGE_SIZE}
                href={(p) => (p > 1 ? `/admin/agents/${id}?page=${p}` : `/admin/agents/${id}`)}
                noun="orders"
              />
            </>
          )}
        </section>

        <section className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
          <h2 className="font-display text-xl text-ink">Customers</h2>
          {customers.error ? (
            <div className="mt-4">
              <Alert tone="danger">We couldn&apos;t load the customers. Please refresh.</Alert>
            </div>
          ) : customerRows.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No customers yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line text-sm">
              {customerRows.map((c) => (
                <li key={c.id} className="py-2.5">
                  <p className="font-semibold text-ink">
                    {c.customer?.full_name?.trim() || c.customer?.email || "Unnamed customer"}
                    {c.customer?.is_provisional && <span className="ml-2 text-xs font-semibold text-warning">Invite pending</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {[c.customer?.email, formatPhone(c.customer?.phone)].filter(Boolean).join(" · ")} · added {formatOrderDate(c.acquired_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
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
