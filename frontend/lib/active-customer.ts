import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { createClient } from "@/lib/supabase/server";

// The signed-in, active customer and their own session client, for the
// account Server Actions. Null for guests, staff and suspended accounts.
export async function activeCustomer() {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "customer" || profile.status !== "active") return null;
  return { supabase, customerId: profile.id };
}
