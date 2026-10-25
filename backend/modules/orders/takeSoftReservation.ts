import type { AnySupabaseClient, FabricReservationRow } from "./types";

export interface TakeSoftReservationParams {
  draftId: string;
  fabricId: string;
  metres: number;
  // Postgres interval literal, e.g. "20 minutes" — the DB function's own
  // default (fn_take_soft_reservation) applies when this is omitted.
  expiresIn?: string;
}

// Thin RPC wrapper over fn_take_soft_reservation (SDS v2 §6.4): the DB
// function holds the stock check and the "one active soft hold per draft"
// rule, so this just forwards the call and surfaces its own error messages
// ("Fabric is not available" / "Not enough fabric in stock") untouched.
export async function takeSoftReservation(
  supabase: AnySupabaseClient,
  params: TakeSoftReservationParams,
): Promise<FabricReservationRow> {
  const { data, error } = await supabase.rpc("fn_take_soft_reservation", {
    p_draft_id: params.draftId,
    p_fabric_id: params.fabricId,
    p_metres: params.metres,
    ...(params.expiresIn !== undefined ? { p_expires_in: params.expiresIn } : {}),
  });
  if (error) throw error;

  return data as FabricReservationRow;
}
