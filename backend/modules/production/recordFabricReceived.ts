import type { AnySupabaseClient, OrderApprovalRow } from "./types";

// FR-PRD-02: the assigned tailor/QC records that the fabric has reached the
// warehouse (fabric_secured -> received_at_hub). fn_record_fabric_received
// checks the role and the job assignment; fn_transition_order the move.
export async function recordFabricReceived(supabase: AnySupabaseClient, jobId: string): Promise<OrderApprovalRow> {
  const { data, error } = await supabase.rpc("fn_record_fabric_received", { p_job_id: jobId });
  if (error) throw error;
  return data as OrderApprovalRow;
}
