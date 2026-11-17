import type { AnySupabaseClient } from "./types";

// FR-FUL-06: an order the customer collects from the workshop. Dispatch marks
// it ready (the customer is told), then hands it over, which completes it.
// Both functions check the dispatch role and that it's a collection order.

export async function markReadyForCollection(supabase: AnySupabaseClient, orderId: string): Promise<{ status: string }> {
  const { data, error } = await supabase.rpc("fn_mark_ready_for_collection", { p_order_id: orderId });
  if (error) throw error;
  return { status: (data as { status: string }).status };
}

export async function markCollected(supabase: AnySupabaseClient, orderId: string): Promise<{ status: string }> {
  const { data, error } = await supabase.rpc("fn_mark_collected", { p_order_id: orderId });
  if (error) throw error;
  return { status: (data as { status: string }).status };
}
