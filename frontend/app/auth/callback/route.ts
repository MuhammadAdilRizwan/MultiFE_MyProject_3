import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth-routing";
import { createClient } from "@/lib/supabase/server";

// Exchanges the `code` from a Supabase email link (sign-up confirmation or
// password reset) for a session, then redirects on.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next")) ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const fallback = next.startsWith("/reset-password") ? "/forgot-password" : "/sign-in";
  return NextResponse.redirect(`${origin}${fallback}?error=link_expired`);
}
