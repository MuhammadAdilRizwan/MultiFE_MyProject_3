import type { AnySupabaseClient, TemplateOptionRow, TemplateRow } from "./types";

interface RawTemplateOption {
  id: string;
  group_id: string;
  value_id: string;
  price_delta: number;
  extra_lead_days: number;
  is_default: boolean;
  option_groups: { key: string; label: string };
  option_values: { key: string; label: string; image_url: string | null };
}

export async function getTemplate(
  supabase: AnySupabaseClient,
  templateId: string,
): Promise<(TemplateRow & { options: TemplateOptionRow[] }) | null> {
  const { data: template, error: templateError } = await supabase
    .from("dress_templates")
    .select(
      "id, name, slug, description, base_stitch_price, lead_days, required_measurements, recommended_options, yardage_formula, is_published",
    )
    .eq("id", templateId)
    .maybeSingle();
  if (templateError) throw templateError;
  if (!template) return null;

  const { data: options, error: optionsError } = await supabase
    .from("template_options")
    .select(
      "id, group_id, value_id, price_delta, extra_lead_days, is_default, option_groups(key,label), option_values(key,label,image_url)",
    )
    .eq("template_id", templateId);
  if (optionsError) throw optionsError;

  const mappedOptions: TemplateOptionRow[] = ((options ?? []) as unknown as RawTemplateOption[]).map((row) => ({
    id: row.id,
    group_id: row.group_id,
    value_id: row.value_id,
    price_delta: row.price_delta,
    extra_lead_days: row.extra_lead_days,
    is_default: row.is_default,
    group: row.option_groups,
    value: row.option_values,
  }));

  return { ...(template as TemplateRow), options: mappedOptions };
}
