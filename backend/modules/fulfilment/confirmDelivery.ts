import type { AnySupabaseClient, OrderRow } from "./types";

export interface ConfirmDeliveryParams {
  orderId: string;
  // fn_transition_order requires this to match the caller's own profile
  // role (or the caller to be admin) — resolved at the Server Action layer
  // from getCurrentProfile, same convention as production's role checks.
  actorRole: "customer" | "agent" | "tailor" | "qc" | "dispatch" | "supplier_contact" | "admin";
  reason?: string;
}

// Thin RPC wrapper over fn_transition_order moving an order to "delivered"
// — there's no dedicated DB function for this step, dispatched -> delivered
// is just a plain transition.
export async function confirmDelivery(supabase: AnySupabaseClient, params: ConfirmDeliveryParams): Promise<OrderRow> {
  const { data, error } = await supabase.rpc("fn_transition_order", {
    p_order_id: params.orderId,
    p_to_status: "delivered",
    p_actor_role: params.actorRole,
    p_reason: params.reason ?? null,
  });
  if (error) throw error;

  return data as OrderRow;
}
