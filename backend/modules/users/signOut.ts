import type { AnySupabaseClient } from "./types";

export async function signOutUser(supabase: AnySupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
