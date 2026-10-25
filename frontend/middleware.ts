import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type AppRole =
  | "customer"
  | "agent"
  | "tailor"
  | "qc"
  | "dispatch"
  | "supplier_contact"
  | "admin";

// D11: role-scoped, not shop-scoped — each panel below is reachable by exactly
// the roles listed, with no shop_id to key off. Unlisted paths (storefront,
// /order, /auth) stay public: FR-CUS-02 requires sign-in only at the
// measurement/checkout steps inside /order, which is enforced where those
// steps are built (page/server-action level), not here.
export const ROUTE_GUARDS: { prefix: string; roles: AppRole[] }[] = [
  { prefix: "/account", roles: ["customer"] },
  { prefix: "/agent", roles: ["agent"] },
  { prefix: "/production", roles: ["tailor", "qc", "dispatch"] },
  { prefix: "/supplier", roles: ["supplier_contact"] },
  { prefix: "/admin", roles: ["admin"] },
];

export function matchGuard(pathname: string) {
  return ROUTE_GUARDS.find(
    (guard) => pathname === guard.prefix || pathname.startsWith(`${guard.prefix}/`),
  );
}

// Refreshes the Supabase session cookie on every request so expired access
// tokens get renewed before a Server Component or Server Action reads them,
// then enforces the role guard above for protected panels.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const guard = matchGuard(request.nextUrl.pathname);
  if (!guard) return response;

  if (!user) {
    const signIn = new URL("/auth/sign-in", request.url);
    signIn.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  // No profile row, or suspended (FR-AUTH-06): drop the session rather than
  // let a stale/blocked account linger on a protected panel.
  if (!profile || profile.status === "suspended") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  if (!guard.roles.includes(profile.role as AppRole)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
