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
  // FR-AI-17: set when the correction changes the fabric needed.
  yardage_before: number | null;
  yardage_after: number | null;
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

// FR-AI-17: what a set of measurements does to the job's order, for the
// assigned tailor/QC — metres only (production staff see no prices).
// needsCustomer: beyond the 2 cm threshold, or it changes the fabric needed
// by at least fn_yardage_change_threshold(), and the customer hasn't
// accepted exactly these values.
export interface CorrectionEffect {
  changesFabric: boolean;
  yardageBefore: number | null;
  yardageAfter: number | null;
  needsCustomer: boolean;
}

export async function getJobCorrectionEffect(
  supabase: AnySupabaseClient,
  params: { jobId: string; values: Record<string, number> },
): Promise<CorrectionEffect> {
  const { data, error } = await supabase.rpc("fn_job_correction_effect", { p_job_id: params.jobId, p_values: params.values });
  if (error) throw error;
  const row = (data ?? {}) as { changes_fabric?: boolean; yardage_before?: number | string | null; yardage_after?: number | string | null; needs_customer?: boolean };
  const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));
  return {
    changesFabric: row.changes_fabric === true,
    yardageBefore: num(row.yardage_before),
    yardageAfter: num(row.yardage_after),
    needsCustomer: row.needs_customer === true,
  };
}

export async function getCorrectionThreshold(supabase: AnySupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("fn_measurement_correction_threshold");
  if (error) throw error;
  return Number(data);
}
