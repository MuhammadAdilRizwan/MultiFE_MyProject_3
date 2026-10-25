import type { AnySupabaseClient } from "./types";

export interface CreateTemplateOptionParams {
  templateId: string;
  groupId: string;
  valueId: string;
  priceDelta?: number;
  extraLeadDays?: number;
  isDefault?: boolean;
}

export interface TemplateOptionInsertResult {
  id: string;
  template_id: string;
  group_id: string;
  value_id: string;
  price_delta: number;
  extra_lead_days: number;
  is_default: boolean;
}

export async function createTemplateOption(
  supabase: AnySupabaseClient,
  params: CreateTemplateOptionParams,
): Promise<TemplateOptionInsertResult> {
  const { data, error } = await supabase
    .from("template_options")
    .insert({
      template_id: params.templateId,
      group_id: params.groupId,
      value_id: params.valueId,
      price_delta: params.priceDelta ?? 0,
      extra_lead_days: params.extraLeadDays ?? 0,
      is_default: params.isDefault ?? false,
    })
    .select("id, template_id, group_id, value_id, price_delta, extra_lead_days, is_default")
    .single();
  if (error) throw error;

  return data as TemplateOptionInsertResult;
}
