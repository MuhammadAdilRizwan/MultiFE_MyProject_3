import type { AnySupabaseClient, ProductionJobRow } from "./types";

// FR-PRD-06/07: an admin orders a remake of a job that failed QC.
// fn_create_remake records the fabric lost, opens an urgent replacement job
// for the chosen tailor/QC and sends the order back to cutting.
export async function createRemake(
  supabase: AnySupabaseClient,
  params: { jobId: string; metresLost: number; assignTo: string },
): Promise<ProductionJobRow> {
  const { data, error } = await supabase.rpc("fn_create_remake", {
    p_job_id: params.jobId,
    p_metres_lost: params.metresLost,
    p_assign_to: params.assignTo,
  });
  if (error) throw error;
  return data as ProductionJobRow;
}
