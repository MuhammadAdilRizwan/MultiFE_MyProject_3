import type { AnySupabaseClient, MeasurementProfileRow } from "./types";

export interface SaveConfirmedMeasurementsParams {
  customerId: string;
  draftId: string;
  // Already validated against the template (rules/validateMeasurements).
  values: Record<string, number>;
  // The draft's current profile, if any. Reused only while no order points
  // at it — an ordered garment's measurements must never change underneath it.
  currentProfileId?: string | null;
}

// FR-AI-12/13 (manual-entry path, FR-AI-08): the customer confirms their
// measurement set. fn_confirm_measurements records who confirmed, their role
// and when; the draft then points at the confirmed profile so the order can
// be created from it. Runs on the customer's own session (RLS: own rows).
export async function saveConfirmedMeasurements(
  supabase: AnySupabaseClient,
  params: SaveConfirmedMeasurementsParams,
): Promise<MeasurementProfileRow> {
  let profileId = params.currentProfileId ?? null;

  if (profileId) {
    const { count, error } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("measurement_profile_id", profileId);
    if (error) throw error;
    if ((count ?? 0) > 0) profileId = null;
  }

  if (!profileId) {
    const { data, error } = await supabase
      .from("measurement_profiles")
      .insert({ customer_id: params.customerId, label: "Me", source: "manual", measurement_values: {} })
      .select("id")
      .single();
    if (error) throw error;
    profileId = (data as { id: string }).id;
  }

  const { data: confirmed, error: confirmError } = await supabase.rpc("fn_confirm_measurements", {
    p_profile_id: profileId,
    p_values: params.values,
    p_actor_role: "customer",
  });
  if (confirmError) throw confirmError;

  const { error: draftError } = await supabase
    .from("order_drafts")
    .update({ measurement_profile_id: profileId, step: "measurements" })
    .eq("id", params.draftId);
  if (draftError) throw draftError;

  return confirmed as MeasurementProfileRow;
}
