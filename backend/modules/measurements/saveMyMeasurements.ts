import { CORE_MEASUREMENT_KEYS, STANDARD_MEASUREMENTS } from "../rules/standardMeasurements";
import { validateMeasurements, type MeasurementValidation } from "../rules/validateMeasurements";
import type { AnySupabaseClient, MeasurementProfileRow } from "./types";

// FR-CUS-15: the customer keeps a saved measurement set in their account,
// outside any order. Same keys and ranges as the templates, so the next
// order's measurement step prefills from it (getLatestConfirmedProfile).
//
// The core fields are always required; the outfit-specific ones are optional
// and are kept only when filled in.
export function validateMyMeasurements(input: Record<string, unknown>): MeasurementValidation {
  const filled = (key: string) => {
    const raw = input[key];
    return raw !== undefined && raw !== null && !(typeof raw === "string" && raw.trim() === "");
  };
  const fields = STANDARD_MEASUREMENTS.filter((f) => CORE_MEASUREMENT_KEYS.includes(f.key) || filled(f.key));
  return validateMeasurements(fields, input);
}

export interface SaveMyMeasurementsParams {
  customerId: string;
  // Already checked with validateMyMeasurements.
  values: Record<string, number>;
}

// Always a new profile: an order or a draft may already point at the
// previous one, and an ordered garment's measurements must never change
// underneath it. fn_confirm_measurements records who confirmed and when.
// Runs on the customer's own session (RLS "measurement_profiles: own").
export async function saveMyMeasurements(
  supabase: AnySupabaseClient,
  params: SaveMyMeasurementsParams,
): Promise<MeasurementProfileRow> {
  const { data, error } = await supabase
    .from("measurement_profiles")
    .insert({ customer_id: params.customerId, label: "Me", source: "manual", measurement_values: {} })
    .select("id")
    .single();
  if (error) throw error;

  const { data: confirmed, error: confirmError } = await supabase.rpc("fn_confirm_measurements", {
    p_profile_id: (data as { id: string }).id,
    p_values: params.values,
    p_actor_role: "customer",
  });
  if (confirmError) throw confirmError;
  return confirmed as MeasurementProfileRow;
}
