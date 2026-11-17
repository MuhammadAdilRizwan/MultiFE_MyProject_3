import "server-only";
import { createClient } from "@/lib/supabase/server";

// Dispatch staff's orders (FR-FUL-01..05), read from dispatch_order_view on
// the session client: the view returns rows only to dispatch staff and
// admins, and carries the delivery address and contact, the outfit, the
// shipment, and the cash the courier collects on an unpaid COD order — no
// other price or payment detail.

export type DispatchOrder = {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  dueDate: string | null;
  address: { full_name?: string; phone?: string; address_line?: string; city?: string } | null;
  customerName: string | null;
  customerPhone: string | null;
  cashToCollect: number | null;
  templateName: string | null;
  fabricName: string | null;
  courier: string | null;
  trackingRef: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  shipmentStatus: string | null;
  failedAttempts: number;
  lastFailureReason: string | null;
  // FR-FUL-06: picked up from the workshop instead of a courier.
  fulfilmentMethod: "delivery" | "collection";
};

const COLUMNS =
  "id, number, status, created_at, est_delivery_date, delivery_address, cash_to_collect, customer_name, customer_phone, template_name, fabric_name, courier, tracking_ref, dispatched_at, delivered_at, shipment_status, failed_attempts, last_failure_reason, fulfilment_method";

type Row = {
  id: string;
  number: string;
  status: string;
  created_at: string;
  est_delivery_date: string | null;
  delivery_address: DispatchOrder["address"];
  cash_to_collect: number | string | null;
  customer_name: string | null;
  customer_phone: string | null;
  template_name: string | null;
  fabric_name: string | null;
  courier: string | null;
  tracking_ref: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  shipment_status: string | null;
  failed_attempts: number;
  last_failure_reason: string | null;
  fulfilment_method: string | null;
};

const toOrder = (r: Row): DispatchOrder => ({
  id: r.id,
  number: r.number,
  status: r.status,
  createdAt: r.created_at,
  dueDate: r.est_delivery_date,
  address: r.delivery_address,
  customerName: r.customer_name,
  customerPhone: r.customer_phone,
  cashToCollect: r.cash_to_collect === null ? null : Number(r.cash_to_collect),
  templateName: r.template_name,
  fabricName: r.fabric_name,
  courier: r.courier,
  trackingRef: r.tracking_ref,
  dispatchedAt: r.dispatched_at,
  deliveredAt: r.delivered_at,
  shipmentStatus: r.shipment_status,
  failedAttempts: Number(r.failed_attempts ?? 0),
  lastFailureReason: r.last_failure_reason,
  fulfilmentMethod: r.fulfilment_method === "collection" ? "collection" : "delivery",
});

// Ready to ship and out for delivery: all of them, earliest due first.
// Delivered: the 30 most recent.
export async function listDispatchOrders(): Promise<{ toShip: DispatchOrder[]; out: DispatchOrder[]; delivered: DispatchOrder[] }> {
  const supabase = await createClient();
  const [open, delivered] = await Promise.all([
    supabase
      .from("dispatch_order_view")
      .select(COLUMNS)
      .in("status", ["ready_to_ship", "dispatched"])
      .order("est_delivery_date", { ascending: true, nullsFirst: false }),
    supabase.from("dispatch_order_view").select(COLUMNS).eq("status", "delivered").order("delivered_at", { ascending: false }).limit(30),
  ]);
  if (open.error) throw open.error;
  if (delivered.error) throw delivered.error;
  const openOrders = ((open.data ?? []) as Row[]).map(toOrder);
  return {
    toShip: openOrders.filter((o) => o.status === "ready_to_ship"),
    out: openOrders.filter((o) => o.status === "dispatched"),
    delivered: ((delivered.data ?? []) as Row[]).map(toOrder),
  };
}

export async function getDispatchOrder(number: string): Promise<DispatchOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("dispatch_order_view").select(COLUMNS).eq("number", number).maybeSingle();
  if (error) throw error;
  return data ? toOrder(data as Row) : null;
}
