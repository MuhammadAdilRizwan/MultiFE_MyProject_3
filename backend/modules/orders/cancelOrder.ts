import type { AnySupabaseClient } from "./types";

// FR-CUS-14 (SRS FR-CUS-16 note in fn_transition_order): a customer cancels
// their own order up to the cutting gate. The statuses below mirror the
// database rule; fn_transition_order is what actually enforces it (role,
// ownership, allowed move), releases the fabric reservation, raises a refund
// when one was paid, writes history, audit and the notification.
export const CUSTOMER_CANCELLABLE_STATUSES = ["placed", "fabric_secured", "received_at_hub", "measurements_approved"] as const;

export const canCustomerCancel = (status: string) =>
  (CUSTOMER_CANCELLABLE_STATUSES as readonly string[]).includes(status);

export class OrderNotCancellableError extends Error {
  constructor(public readonly reason: "not_found" | "too_late") {
    super(reason === "not_found" ? "Order not found" : "This order can no longer be cancelled");
    this.name = "OrderNotCancellableError";
  }
}

export interface CancelMyOrderParams {
  customerId: string;
  orderNumber: string;
  reason: string;
}

// Runs on the customer's own session: RLS ("orders: customer reads own")
// scopes the lookup, and the explicit customer_id filter keeps an agent's or
// admin's session from using this path.
export async function cancelMyOrder(
  supabase: AnySupabaseClient,
  params: CancelMyOrderParams,
): Promise<{ status: string }> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, status")
    .eq("number", params.orderNumber)
    .eq("customer_id", params.customerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new OrderNotCancellableError("not_found");
  const order = data as { id: string; status: string };
  if (!canCustomerCancel(order.status)) throw new OrderNotCancellableError("too_late");

  const { data: updated, error: rpcError } = await supabase.rpc("fn_transition_order", {
    p_order_id: order.id,
    p_to_status: "cancelled",
    p_actor_role: "customer",
    p_reason: params.reason,
  });
  if (rpcError) throw rpcError;
  return { status: (updated as { status: string }).status };
}
