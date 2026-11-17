import type { AnySupabaseClient } from "./types";

// Fulfilment (FR-FUL-01..05), for dispatch staff and admins. Every write goes
// through a SECURITY DEFINER function that checks the role, the shipment's
// state and (for status changes) calls fn_transition_order.

export interface ShipmentRow {
  id: string;
  order_id: string;
  courier: string | null;
  tracking_ref: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  status: "pending" | "dispatched" | "delivered" | "delivery_failed" | "ready_for_collection" | "completed";
  attempts: number;
  last_failure_reason: string | null;
}

// ready_to_ship -> dispatched, with courier + tracking (FR-FUL-02).
export async function dispatchOrder(
  supabase: AnySupabaseClient,
  params: { orderId: string; courier: string; trackingRef: string },
): Promise<{ status: string }> {
  const { data, error } = await supabase.rpc("fn_dispatch_order", {
    p_order_id: params.orderId,
    p_courier: params.courier,
    p_tracking_ref: params.trackingRef,
  });
  if (error) throw error;
  return { status: (data as { status: string }).status };
}

// dispatched -> delivered (FR-FUL-04).
export async function markDelivered(supabase: AnySupabaseClient, orderId: string): Promise<{ status: string }> {
  const { data, error } = await supabase.rpc("fn_mark_delivered", { p_order_id: orderId });
  if (error) throw error;
  return { status: (data as { status: string }).status };
}

// The courier couldn't deliver: the order stays dispatched, the shipment waits
// for a reattempt, the customer is told (FR-FUL-05).
export async function recordDeliveryFailure(
  supabase: AnySupabaseClient,
  params: { orderId: string; reason: string },
): Promise<ShipmentRow> {
  const { data, error } = await supabase.rpc("fn_record_delivery_failure", {
    p_order_id: params.orderId,
    p_reason: params.reason,
  });
  if (error) throw error;
  return data as ShipmentRow;
}

export async function reattemptDelivery(
  supabase: AnySupabaseClient,
  params: { orderId: string; courier: string; trackingRef: string },
): Promise<ShipmentRow> {
  const { data, error } = await supabase.rpc("fn_reattempt_delivery", {
    p_order_id: params.orderId,
    p_courier: params.courier,
    p_tracking_ref: params.trackingRef,
  });
  if (error) throw error;
  return data as ShipmentRow;
}
