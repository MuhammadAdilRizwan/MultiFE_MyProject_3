import type { AnySupabaseClient, TemplateRow } from "./types";

// Read-only: RLS already restricts to published templates for the public,
// plus production's own read grant.
export async function listTemplates(supabase: AnySupabaseClient): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from("dress_templates")
    .select(
      "id, name, slug, description, base_stitch_price, lead_days, required_measurements, recommended_options, yardage_formula, is_published",
    )
    .order("name");
  if (error) throw error;

  return data as TemplateRow[];
}
