import "server-only";
import type { ResolvedOption } from "@multife/backend/modules/rules/orderSummary";
import { createClient } from "@/lib/supabase/server";

// Orders for the signed-in user: a customer's own orders, or the orders an
// agent placed for their customers (FR-AGT-11). Uses the session client, so
// RLS ("orders: customer reads own" / "orders: agent reads placed by self",
// and the same on order_items / order_status_history) is what scopes the
// rows — never the admin client. The extra column filter just picks which of
// the two views the page wants.

// "admin" adds no column filter: "orders: admin all" (an active admin) is
// what lets every order through.
export type OrderScope = "customer" | "agent" | "admin";
const SCOPE_COLUMN: Record<OrderScope, string | null> = { customer: "customer_id", agent: "agent_id", admin: null };

export type OrderListItem = {
  number: string;
  status: string;
  total: number;
  createdAt: string;
  estDeliveryDate: string | null;
  templateName: string;
  brandName: string | null;
  fabricName: string | null;
  fabricImage: string | null;
  customerName: string | null;
  customerPhone: string | null;
  channel: string;
};

export type OrderDetail = OrderListItem & {
  paymentMethod: string;
  paymentStatus: string;
  yardageMetres: number | null;
  fabricCost: number;
  stitchCost: number;
  optionsCost: number;
  delivery: { method?: "delivery" | "collection"; full_name?: string; phone?: string; address_line?: string; city?: string } | null;
  options: ResolvedOption[];
  measurements: Record<string, number>;
  history: { status: string; at: string }[];
  // Why it was cancelled or failed, as given by the customer, agent or admin.
  cancelledReason: string | null;
  // Courier and tracking once dispatched (FR-FUL-03).
  // The latest measurement correction the workshop asked about (FR-AI-16).
  correction: {
    id: string;
    status: "pending" | "accepted" | "declined";
    original: Record<string, number>;
    proposed: Record<string, number>;
    reason: string;
    responseNote: string | null;
    createdAt: string;
  } | null;
  shipment: {
    courier: string | null;
    trackingRef: string | null;
    status: string;
    dispatchedAt: string | null;
    deliveredAt: string | null;
    failedAttempts: number;
    lastFailureReason: string | null;
  } | null;
};

type ShipmentRow = {
  courier: string | null;
  tracking_ref: string | null;
  status: string;
  dispatched_at: string | null;
  delivered_at: string | null;
  attempts: number;
  last_failure_reason: string | null;
};

const ORDER_COLUMNS = `
  id, number, status, total, created_at, est_delivery_date, payment_method, payment_status, order_channel,
  yardage_metres, fabric_cost, stitch_cost, options_cost, delivery_address, cancelled_reason,
  supplier:suppliers(name),
  customer:profiles!orders_customer_id_fkey(full_name, phone),
  fabric:fabrics(name, display_name, images:fabric_images(url, sort)),
  items:order_items(template_name, options, measurements)
`;

// Detail only: RLS "shipments: customer reads own / agent reads placed by
// self / admin all" scopes it the same way as the order.
const SHIPMENT_COLUMNS = "courier, tracking_ref, status, dispatched_at, delivered_at, attempts, last_failure_reason";

type OrderRow = {
  id: string;
  number: string;
  status: string;
  total: number | string;
  created_at: string;
  est_delivery_date: string | null;
  payment_method: string;
  payment_status: string;
  order_channel: string;
  customer: { full_name: string | null; phone: string | null } | null;
  yardage_metres: number | string | null;
  fabric_cost: number | string;
  stitch_cost: number | string;
  options_cost: number | string;
  delivery_address: OrderDetail["delivery"];
  cancelled_reason: string | null;
  supplier: { name: string } | null;
  fabric: { name: string; display_name: string | null; images: { url: string; sort: number }[] } | null;
  items: { template_name: string; options: unknown; measurements: Record<string, number> | null }[];
};

function toListItem(row: OrderRow): OrderListItem {
  const images = [...(row.fabric?.images ?? [])].sort((a, b) => a.sort - b.sort);
  return {
    number: row.number,
    status: row.status,
    total: Number(row.total),
    createdAt: row.created_at,
    estDeliveryDate: row.est_delivery_date,
    templateName: row.items[0]?.template_name ?? "Custom outfit",
    brandName: row.supplier?.name ?? null,
    fabricName: row.fabric ? row.fabric.display_name || row.fabric.name : null,
    fabricImage: images[0]?.url ?? null,
    customerName: row.customer?.full_name ?? null,
    customerPhone: row.customer?.phone ?? null,
    channel: row.order_channel,
  };
}

export async function listMyOrders(scope: OrderScope = "customer"): Promise<OrderListItem[]> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  let query = supabase.from("orders").select(ORDER_COLUMNS).order("created_at", { ascending: false });
  const column = SCOPE_COLUMN[scope];
  if (column) query = query.eq(column, auth.user.id);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as OrderRow[]).map(toListItem);
}

export const ADMIN_ORDERS_PAGE_SIZE = 25;

// overdueBefore ("YYYY-MM-DD"): only orders due before that day (FR-PRD-08).
// agentId: only orders this agent (profile id) placed (FR-AGT-13).
// disputeOpen: only orders with an open dispute (UC-12).
export type AdminOrderFilter = {
  statuses?: readonly string[];
  search?: string;
  page?: number;
  overdueBefore?: string;
  agentId?: string;
  disputeOpen?: boolean;
};

// Every order, for the admin panel (FR-ADM-06): newest first, filtered by a
// status group and by order number or customer name, a page at a time.
export async function listAllOrders(filter: AdminOrderFilter = {}): Promise<{ orders: OrderListItem[]; total: number }> {
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(filter.page ?? 1));
  const term = (filter.search ?? "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().slice(0, 60);
  const byNumber = /^(mf-?)?[\d-]+$/i.test(term);
  // Searching by name needs the customer join to filter the orders (!inner).
  const columns = term && !byNumber ? ORDER_COLUMNS.replace("customer:profiles!orders_customer_id_fkey(", "customer:profiles!orders_customer_id_fkey!inner(") : ORDER_COLUMNS;

  let query = supabase
    .from("orders")
    .select(columns, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * ADMIN_ORDERS_PAGE_SIZE, page * ADMIN_ORDERS_PAGE_SIZE - 1);
  if (filter.statuses?.length) query = query.in("status", [...filter.statuses]);
  if (filter.overdueBefore) query = query.lt("est_delivery_date", filter.overdueBefore);
  if (filter.agentId) query = query.eq("agent_id", filter.agentId);
  if (filter.disputeOpen) query = query.not("dispute_opened_at", "is", null);
  if (term) query = byNumber ? query.ilike("number", `%${term}%`) : query.ilike("customer.full_name", `%${term}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { orders: (data as unknown as OrderRow[]).map(toListItem), total: count ?? 0 };
}

export async function getMyOrder(number: string, scope: OrderScope = "customer"): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  let query = supabase.from("orders").select(ORDER_COLUMNS).eq("number", number);
  const column = SCOPE_COLUMN[scope];
  if (column) query = query.eq(column, auth.user.id);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as OrderRow;

  const { data: history, error: historyError } = await supabase
    .from("order_status_history")
    .select("to_status, created_at")
    .eq("order_id", row.id)
    .order("created_at", { ascending: true });
  if (historyError) throw historyError;

  // RLS "measurement_corrections: customer reads own / agent reads placed by
  // self / admin all". Superseded ones are history only.
  const { data: correctionRow, error: correctionError } = await supabase
    .from("measurement_corrections")
    .select("id, status, original, proposed, reason, response_note, created_at")
    .eq("order_id", row.id)
    .neq("status", "superseded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (correctionError) throw correctionError;
  const correction = correctionRow as {
    id: string;
    status: "pending" | "accepted" | "declined";
    original: Record<string, number>;
    proposed: Record<string, number>;
    reason: string;
    response_note: string | null;
    created_at: string;
  } | null;

  const { data: shipmentRow, error: shipmentError } = await supabase
    .from("shipments")
    .select(SHIPMENT_COLUMNS)
    .eq("order_id", row.id)
    .maybeSingle();
  if (shipmentError) throw shipmentError;
  const shipment = shipmentRow as ShipmentRow | null;

  const item = row.items[0];
  return {
    ...toListItem(row),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    yardageMetres: row.yardage_metres === null ? null : Number(row.yardage_metres),
    fabricCost: Number(row.fabric_cost),
    stitchCost: Number(row.stitch_cost),
    optionsCost: Number(row.options_cost),
    delivery: row.delivery_address,
    options: Array.isArray(item?.options) ? (item.options as ResolvedOption[]) : [],
    measurements: item?.measurements ?? {},
    history: (history ?? []).map((h) => ({ status: h.to_status as string, at: h.created_at as string })),
    cancelledReason: row.cancelled_reason,
    correction: correction
      ? {
          id: correction.id,
          status: correction.status,
          original: correction.original,
          proposed: correction.proposed,
          reason: correction.reason,
          responseNote: correction.response_note,
          createdAt: correction.created_at,
        }
      : null,
    shipment: shipment
      ? {
          courier: shipment.courier,
          trackingRef: shipment.tracking_ref,
          status: shipment.status,
          dispatchedAt: shipment.dispatched_at,
          deliveredAt: shipment.delivered_at,
          failedAttempts: shipment.attempts,
          lastFailureReason: shipment.last_failure_reason,
        }
      : null,
  };
}
