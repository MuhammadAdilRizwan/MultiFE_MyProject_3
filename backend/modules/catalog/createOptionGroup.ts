import type { AnySupabaseClient, OptionGroupRow } from "./types";

export interface CreateOptionGroupParams {
  key: string;
  label: string;
  sort?: number;
}

export async function createOptionGroup(
  supabase: AnySupabaseClient,
  params: CreateOptionGroupParams,
): Promise<OptionGroupRow> {
  const { data, error } = await supabase
    .from("option_groups")
    .insert({ key: params.key, label: params.label, sort: params.sort ?? 0 })
    .select("id, key, label, sort")
    .single();
  if (error) throw error;

  return data as OptionGroupRow;
}
