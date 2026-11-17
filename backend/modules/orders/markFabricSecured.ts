import type { AnySupabaseClient } from "./types";

// Admin confirms the order's fabric is secured from the supplier
// (placed -> fabric_secured), the step before the warehouse can receive it.
// Store APIs that confirm supply aren't connected yet, so this is manual.
// fn_transition_order checks the admin role and the allowed move.
export async function markFabricSecured(supabase: AnySupabaseClient, orderId: string): Promise<{ status: string }> {
  const { data, error } = await supabase.rpc("fn_transition_order", {
    p_order_id: orderId,
    p_to_status: "fabric_secured",
    p_actor_role: "admin",
  });
  if (error) throw error;
  return { status: (data as { status: string }).status };
}
