import type { AnySupabaseClient, OptionValueRow } from "./types";

export interface CreateOptionValueParams {
  groupId: string;
  key: string;
  label: string;
  imageUrl?: string;
  sort?: number;
}

export async function createOptionValue(
  supabase: AnySupabaseClient,
  params: CreateOptionValueParams,
): Promise<OptionValueRow> {
  const { data, error } = await supabase
    .from("option_values")
    .insert({
      group_id: params.groupId,
      key: params.key,
      label: params.label,
      image_url: params.imageUrl ?? null,
      sort: params.sort ?? 0,
    })
    .select("id, group_id, key, label, image_url, sort")
    .single();
  if (error) throw error;

  return data as OptionValueRow;
}
