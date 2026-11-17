import type { AnySupabaseClient, OrderRow } from "./types";

export interface DispatchOrderParams {
  orderId: string;
  courier: string;
  trackingRef: string;
}

// Thin RPC wrapper over fn_dispatch_order: the DB function records the
// shipment (courier, tracking ref) and transitions ready_to_ship ->
// dispatched, checking is_dispatch()/is_admin() internally, so this just
// forwards the call and surfaces its own errors untouched.
export async function dispatchOrder(supabase: AnySupabaseClient, params: DispatchOrderParams): Promise<OrderRow> {
  const { data, error } = await supabase.rpc("fn_dispatch_order", {
    p_order_id: params.orderId,
    p_courier: params.courier,
    p_tracking_ref: params.trackingRef,
  });
  if (error) throw error;

  return data as OrderRow;
}
