import "server-only";
import { createClient } from "@/lib/supabase/server";

// UC-12 "Handle a dispute": an order's internal notes, dispute state and audit
// trail for the admin order page. Admin session: "order_notes: admin read",
// "audit_log: admin read", "orders / production_jobs / shipments /
// measurement_corrections / profiles: admin all".

export type OrderRecordEntry = {
  id: string;
  at: string;
  kind: "note" | "dispute_opened" | "dispute_resolved" | "audit";
  // audit: the action name; notes: the note itself.
  action: string | null;
  body: string | null;
  before: unknown;
  after: unknown;
  by: string | null;
};

export type OrderAdminRecord = {
  orderId: string;
  status: string;
  paymentStatus: string;
  disputeOpenedAt: string | null;
  entries: OrderRecordEntry[];
};

const nameOf = (p: { full_name: string | null; email: string | null } | null) => (p ? p.full_name?.trim() || p.email : null);

export async function getOrderAdminRecord(number: string): Promise<OrderAdminRecord | null> {
  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, payment_status, dispute_opened_at")
    .eq("number", number)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;
  const o = order as { id: string; status: string; payment_status: string; dispute_opened_at: string | null };

  // Everything audited about this order, its jobs, shipment and corrections.
  const [jobs, shipments, corrections] = await Promise.all([
    supabase.from("production_jobs").select("id").eq("order_id", o.id),
    supabase.from("shipments").select("id").eq("order_id", o.id),
    supabase.from("measurement_corrections").select("id").eq("order_id", o.id),
  ]);
  for (const r of [jobs, shipments, corrections]) if (r.error) throw r.error;
  const relatedIds = [o.id, ...[jobs, shipments, corrections].flatMap((r) => (r.data ?? []).map((x) => (x as { id: string }).id))];

  const [notes, audit] = await Promise.all([
    supabase
      .from("order_notes")
      .select("id, kind, body, created_at, author:profiles(full_name, email)")
      .eq("order_id", o.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("audit_log")
      .select("id, action, before, after, created_at, actor:profiles(full_name, email)")
      .in("entity_id", relatedIds)
      // Notes are listed from order_notes already.
      .not("action", "in", "(order.note,order.dispute_open,order.dispute_resolve)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (notes.error) throw notes.error;
  if (audit.error) throw audit.error;

  type Person = { full_name: string | null; email: string | null } | null;
  const entries: OrderRecordEntry[] = [
    ...((notes.data ?? []) as unknown as { id: string; kind: OrderRecordEntry["kind"]; body: string; created_at: string; author: Person }[]).map(
      (n) => ({ id: n.id, at: n.created_at, kind: n.kind, action: null, body: n.body, before: null, after: null, by: nameOf(n.author) }),
    ),
    ...((audit.data ?? []) as unknown as { id: string; action: string; before: unknown; after: unknown; created_at: string; actor: Person }[]).map(
      (a) => ({ id: a.id, at: a.created_at, kind: "audit" as const, action: a.action, body: null, before: a.before, after: a.after, by: nameOf(a.actor) }),
    ),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return { orderId: o.id, status: o.status, paymentStatus: o.payment_status, disputeOpenedAt: o.dispute_opened_at, entries };
}
