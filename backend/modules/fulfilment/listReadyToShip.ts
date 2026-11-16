import type { AnySupabaseClient, ReadyToShipOrderRow } from "./types";

// Reads through the user's own RLS-scoped client — relies on
// production_order_view's own predicate to limit this to orders dispatch is
// actually allowed to see. The explicit status filter keeps this function's
// meaning ("the dispatch queue") correct even for an admin caller, who'd
// otherwise see every status the view exposes.
export async function listReadyToShip(supabase: AnySupabaseClient): Promise<ReadyToShipOrderRow[]> {
  const { data, error } = await supabase
    .from("production_order_view")
    .select("id, number, status, est_delivery_date, created_at")
    .eq("status", "ready_to_ship")
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []) as unknown as ReadyToShipOrderRow[];
}
