import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client. Sessions are stored in cookies, so the server sees them too.
// detectSessionInUrl is off: admin-sent invite links arrive as an implicit-flow
// URL hash, which this PKCE client would reject — the accept-invite page reads
// the hash itself instead.
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { detectSessionInUrl: false },
  });
}
