import type { AnySupabaseClient, ProductionJobRow, ProductionStage } from "./types";

export interface AdvanceStageParams {
  jobId: string;
  toStage: ProductionStage;
  reason?: string;
}

// Thin RPC wrapper over fn_advance_production_stage: the DB function holds
// the stage-sequencing rules and keeps the order's own status in step
// (cutting -> in_cutting, stitching -> in_stitching, etc.), so this just
// forwards the call and surfaces its own errors untouched.
export async function advanceStage(
  supabase: AnySupabaseClient,
  params: AdvanceStageParams,
): Promise<ProductionJobRow> {
  const { data, error } = await supabase.rpc("fn_advance_production_stage", {
    p_job_id: params.jobId,
    p_to_stage: params.toStage,
    p_reason: params.reason ?? null,
  });
  if (error) throw error;

  return data as ProductionJobRow;
}
