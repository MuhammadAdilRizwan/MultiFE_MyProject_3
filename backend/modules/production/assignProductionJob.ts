import type { AnySupabaseClient, ProductionJobRow } from "./types";

export interface AssignProductionJobParams {
  jobId: string;
  assignedToId: string;
}

// Plain table write, not an RPC — there's no DB function for this and none is
// needed: "production_jobs: admin all" already lets an admin's own session
// write it, and there's no extra business logic (no stage change, no event
// row) to assigning a job to a tailor/QC.
export async function assignProductionJob(
  supabase: AnySupabaseClient,
  params: AssignProductionJobParams,
): Promise<ProductionJobRow> {
  const { data, error } = await supabase
    .from("production_jobs")
    .update({ assigned_to_id: params.assignedToId })
    .eq("id", params.jobId)
    .select("id, order_id, assigned_to_id, stage, started_at, finished_at, priority")
    .single();
  if (error) throw error;

  return data as ProductionJobRow;
}
