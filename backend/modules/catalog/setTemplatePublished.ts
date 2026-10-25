import type { AnySupabaseClient } from "./types";

export async function setTemplatePublished(
  supabase: AnySupabaseClient,
  templateId: string,
  isPublished: boolean,
): Promise<void> {
  const { error } = await supabase.from("dress_templates").update({ is_published: isPublished }).eq("id", templateId);
  if (error) throw error;
}
