import type { AnySupabaseClient, OrderDraftRow } from "./types";

export interface CreateDraftParams {
  customerId: string;
  fabricId: string;
  templateId: string;
}

// Always created at step "fabric" with no options chosen yet — the
// customer/agent adds those with updateDraftOptions once they've seen what
// the fabric+template combination actually supports.
export async function createDraft(
  supabase: AnySupabaseClient,
  params: CreateDraftParams,
): Promise<OrderDraftRow> {
  const { data, error } = await supabase
    .from("order_drafts")
    .insert({
      customer_id: params.customerId,
      fabric_id: params.fabricId,
      template_id: params.templateId,
      options: {},
      step: "fabric",
    })
    .select("id, customer_id, agent_id, fabric_id, template_id, options, measurement_profile_id, step, expires_at")
    .single();
  if (error) throw error;

  return data as OrderDraftRow;
}
