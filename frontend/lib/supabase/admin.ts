import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service-role client: bypasses RLS entirely. Server-only — never import
// this from a Client Component or anywhere that could reach the browser.
// Used for invites (Auth admin API) and other operations that must act
// before the target user has a session of their own.
export function createAdminClient() {
  return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
