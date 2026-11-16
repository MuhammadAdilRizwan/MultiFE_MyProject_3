import type { AnySupabaseClient, OrderApprovalRow } from "./types";

export interface ApproveForProductionParams {
  jobId: string;
  values: Record<string, number>;
  reason?: string;
}

// Thin RPC wrapper over fn_approve_for_production (the cutting-gate
// checkpoint, D8): the DB function holds the measurement-validation and
// production_approved_at/by_id write, so this just forwards the call and
// surfaces its own validation errors ("Invalid measurements: ...") untouched.
export async function approveForProduction(
  supabase: AnySupabaseClient,
  params: ApproveForProductionParams,
): Promise<OrderApprovalRow> {
  const { data, error } = await supabase.rpc("fn_approve_for_production", {
    p_job_id: params.jobId,
    p_values: params.values,
    p_reason: params.reason ?? null,
  });
  if (error) throw error;

  return data as OrderApprovalRow;
}
