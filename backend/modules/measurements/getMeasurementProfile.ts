import { PROFILE_COLUMNS, type AnySupabaseClient, type MeasurementProfileRow } from "./types";

// One profile by id. RLS limits a customer to their own profiles.
export async function getMeasurementProfile(
  supabase: AnySupabaseClient,
  profileId: string,
): Promise<MeasurementProfileRow | null> {
  const { data, error } = await supabase
    .from("measurement_profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data as MeasurementProfileRow | null;
}

// The customer's most recently confirmed set, to prefill the next order's
// measurement step (FR-CUS-14 reuse). Null when they have none.
export async function getLatestConfirmedProfile(
  supabase: AnySupabaseClient,
  customerId: string,
): Promise<MeasurementProfileRow | null> {
  const { data, error } = await supabase
    .from("measurement_profiles")
    .select(PROFILE_COLUMNS)
    .eq("customer_id", customerId)
    .not("confirmed_at", "is", null)
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as MeasurementProfileRow | null;
}
