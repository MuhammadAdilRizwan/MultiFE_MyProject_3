import "server-only";
import type { ResolvedOption } from "@multife/backend/modules/rules/orderSummary";
import { createClient } from "@/lib/supabase/server";

// Orders for the signed-in user: a customer's own orders, or the orders an
// agent placed for their customers (FR-AGT-11). Uses the session client, so
// RLS ("orders: customer reads own" / "orders: agent reads placed by self",
// and the same on order_items / order_status_history) is what scopes the
// rows — never the admin client. The extra column filter just picks which of
// the two views the page wants.

export type OrderScope = "customer" | "agent";
const SCOPE_COLUMN: Record<OrderScope, string> = { customer: "customer_id", agent: "agent_id" };

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
  delivery: { full_name?: string; phone?: string; address_line?: string; city?: string } | null;
  options: ResolvedOption[];
  measurements: Record<string, number>;
  history: { status: string; at: string }[];
  // Why it was cancelled or failed, as given by the customer, agent or admin.
  cancelledReason: string | null;
};

const ORDER_COLUMNS = `
  id, number, status, total, created_at, est_delivery_date, payment_method, payment_status, order_channel,
  yardage_metres, fabric_cost, stitch_cost, options_cost, delivery_address, cancelled_reason,
  supplier:suppliers(name),
  customer:profiles!orders_customer_id_fkey(full_name, phone),
  fabric:fabrics(name, display_name, images:fabric_images(url, sort)),
  items:order_items(template_name, options, measurements)
`;

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

  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq(SCOPE_COLUMN[scope], auth.user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as OrderRow[]).map(toListItem);
}

export async function getMyOrder(number: string, scope: OrderScope = "customer"): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq(SCOPE_COLUMN[scope], auth.user.id)
    .eq("number", number)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as OrderRow;

  const { data: history, error: historyError } = await supabase
    .from("order_status_history")
    .select("to_status, created_at")
    .eq("order_id", row.id)
    .order("created_at", { ascending: true });
  if (historyError) throw historyError;

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
  };
}
