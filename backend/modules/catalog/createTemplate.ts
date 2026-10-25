import type { AnySupabaseClient, TemplateRow } from "./types";

export interface CreateTemplateParams {
  name: string;
  slug: string;
  description?: string;
  baseStitchPrice?: number;
  leadDays?: number;
  requiredMeasurements?: TemplateRow["required_measurements"];
  recommendedOptions?: TemplateRow["recommended_options"];
  yardageFormula?: TemplateRow["yardage_formula"];
}

// Always created unpublished — an admin publishes explicitly once the
// template's options are set up (setTemplatePublished).
export async function createTemplate(
  supabase: AnySupabaseClient,
  params: CreateTemplateParams,
): Promise<TemplateRow> {
  const { data, error } = await supabase
    .from("dress_templates")
    .insert({
      name: params.name,
      slug: params.slug,
      description: params.description ?? null,
      base_stitch_price: params.baseStitchPrice ?? 0,
      lead_days: params.leadDays ?? 7,
      required_measurements: params.requiredMeasurements ?? [],
      recommended_options: params.recommendedOptions ?? {},
      yardage_formula: params.yardageFormula ?? {},
      is_published: false,
    })
    .select(
      "id, name, slug, description, base_stitch_price, lead_days, required_measurements, recommended_options, yardage_formula, is_published",
    )
    .single();
  if (error) throw error;

  return data as TemplateRow;
}
