import type { AnySupabaseClient, ConsentRow } from "./types";

export type ConsentMethod = "in_person" | "phone_call" | "signed_form";

// FR-AGT-07: the customer's consent for the agent to take their measurements
// and place this order. fn_agent_record_consent checks the agent owns the
// draft and is assigned to the customer, writes the audit entry, and is
// idempotent per draft. Runs on the agent's own session.
export async function recordConsent(
  supabase: AnySupabaseClient,
  params: { draftId: string; method: ConsentMethod },
): Promise<ConsentRow> {
  const { data, error } = await supabase.rpc("fn_agent_record_consent", {
    p_draft_id: params.draftId,
    p_method: params.method,
  });
  if (error) throw error;
  return data as ConsentRow;
}

// Whether this draft already has the agent's consent record (RLS: an agent
// reads the consents they recorded).
export async function hasDraftConsent(supabase: AnySupabaseClient, draftId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("order_consents")
    .select("id")
    .eq("consent_type", "agent_on_behalf")
    .eq("evidence->>draft_id", draftId)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
