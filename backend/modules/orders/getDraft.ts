import type { AnySupabaseClient, OrderDraftRow } from "./types";

export async function getDraft(
  supabase: AnySupabaseClient,
  draftId: string,
): Promise<OrderDraftRow | null> {
  const { data, error } = await supabase
    .from("order_drafts")
    .select("id, customer_id, agent_id, fabric_id, template_id, options, measurement_profile_id, step, expires_at")
    .eq("id", draftId)
    .maybeSingle();
  if (error) throw error;

  return data as OrderDraftRow | null;
}
