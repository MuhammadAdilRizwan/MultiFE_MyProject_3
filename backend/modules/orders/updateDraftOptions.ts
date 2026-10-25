import type { AnySupabaseClient, OrderDraftRow } from "./types";

// Pure single-table write. Checking that `options` is actually supported by
// the draft's fabric+template (evaluateOptions + isSelectionSupported) is
// the caller's job — same division as getTemplateOptionsForFabricAction,
// which does that composition at the Server Action layer.
export async function updateDraftOptions(
  supabase: AnySupabaseClient,
  draftId: string,
  options: Record<string, string>,
): Promise<OrderDraftRow> {
  const { data, error } = await supabase
    .from("order_drafts")
    .update({ options, step: "customize" })
    .eq("id", draftId)
    .select("id, customer_id, agent_id, fabric_id, template_id, options, measurement_profile_id, step, expires_at")
    .single();
  if (error) throw error;

  return data as OrderDraftRow;
}
