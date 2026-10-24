import type { AnySupabaseClient, ProfileRow } from "./types";

// Reads the caller's own profile. Relies on RLS ("profiles: read own"),
// so it only ever returns the signed-in user's row.
export async function getCurrentProfile(
  supabase: AnySupabaseClient,
): Promise<ProfileRow | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, phone, email, status")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) throw error;
  return data as ProfileRow | null;
}
