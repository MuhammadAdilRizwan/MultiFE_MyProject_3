import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { createClient } from "@/lib/supabase/server";

// The signed-in, active admin and their own session client, for admin
// Server Actions (the layout guards pages, but actions are callable on their
// own). RLS's is_admin() re-checks the same thing on every query.
export async function activeAdmin() {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin" || profile.status !== "active") return null;
  return { supabase, adminId: profile.id };
}
