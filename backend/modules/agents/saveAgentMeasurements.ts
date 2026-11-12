import type { MeasurementProfileRow } from "../measurements/types";
import type { AnySupabaseClient } from "./types";

// FR-AI-12/13 (agent path): the agent confirms the measurements they took for
// the customer. fn_agent_save_measurements requires the customer's consent
// first, stores the profile as the customer's (source 'agent', confirmed by
// the agent), links it to the draft and audits it. `values` must already be
// validated against the template (rules/validateMeasurements).
export async function saveAgentMeasurements(
  supabase: AnySupabaseClient,
  params: { draftId: string; values: Record<string, number> },
): Promise<MeasurementProfileRow> {
  const { data, error } = await supabase.rpc("fn_agent_save_measurements", {
    p_draft_id: params.draftId,
    p_values: params.values,
  });
  if (error) throw error;
  return data as MeasurementProfileRow;
}
