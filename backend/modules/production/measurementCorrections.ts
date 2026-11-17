import type { AnySupabaseClient } from "./types";

// FR-AI-16 / FR-NOT-05: a tailor/QC correction beyond the threshold
// (fn_measurement_correction_threshold) goes to the customer before the
// measurements can be approved; the order waits before cutting meanwhile.

export interface MeasurementCorrectionRow {
  id: string;
  order_id: string;
  job_id: string;
  original: Record<string, number>;
  proposed: Record<string, number>;
  reason: string;
  status: "pending" | "accepted" | "declined" | "superseded";
  responded_at: string | null;
  response_note: string | null;
  created_at: string;
}

export async function requestMeasurementCorrection(
  supabase: AnySupabaseClient,
  params: { jobId: string; values: Record<string, number>; reason: string },
): Promise<MeasurementCorrectionRow> {
  const { data, error } = await supabase.rpc("fn_request_measurement_correction", {
    p_job_id: params.jobId,
    p_values: params.values,
    p_reason: params.reason,
  });
  if (error) throw error;
  return data as MeasurementCorrectionRow;
}

// The customer (or the agent who placed the order) accepts or declines.
export async function respondMeasurementCorrection(
  supabase: AnySupabaseClient,
  params: { correctionId: string; accept: boolean; note?: string },
): Promise<MeasurementCorrectionRow> {
  const { data, error } = await supabase.rpc("fn_respond_measurement_correction", {
    p_correction_id: params.correctionId,
    p_accept: params.accept,
    p_note: params.note ?? null,
  });
  if (error) throw error;
  return data as MeasurementCorrectionRow;
}

export async function getCorrectionThreshold(supabase: AnySupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("fn_measurement_correction_threshold");
  if (error) throw error;
  return Number(data);
}
