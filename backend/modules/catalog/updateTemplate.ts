import type { AnySupabaseClient, TemplateRow } from "./types";

export interface UpdateTemplateParams {
  name?: string;
  description?: string;
  baseStitchPrice?: number;
  leadDays?: number;
  requiredMeasurements?: TemplateRow["required_measurements"];
  recommendedOptions?: TemplateRow["recommended_options"];
  yardageFormula?: TemplateRow["yardage_formula"];
}

const FIELD_COLUMNS: Record<keyof UpdateTemplateParams, string> = {
  name: "name",
  description: "description",
  baseStitchPrice: "base_stitch_price",
  leadDays: "lead_days",
  requiredMeasurements: "required_measurements",
  recommendedOptions: "recommended_options",
  yardageFormula: "yardage_formula",
};

// Publishing status is a separate, deliberate action — see setTemplatePublished.
export async function updateTemplate(
  supabase: AnySupabaseClient,
  templateId: string,
  patch: UpdateTemplateParams,
): Promise<void> {
  const update: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(FIELD_COLUMNS) as [keyof UpdateTemplateParams, string][]) {
    if (patch[key] !== undefined) update[column] = patch[key];
  }

  const { error } = await supabase.from("dress_templates").update(update).eq("id", templateId);
  if (error) throw error;
}
