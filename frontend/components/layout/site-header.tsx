import Link from "next/link";
import { getCurrentAgent } from "@multife/backend/modules/agents/getCurrentAgent";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { ActingForBar } from "@/components/agent/acting-for-bar";
import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { StaffBar } from "@/components/layout/workspace-switch";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  const staffRole = profile?.status === "active" && (profile.role === "agent" || profile.role === "admin") ? profile.role : null;
  const agent = staffRole === "agent" ? await getCurrentAgent(supabase).catch(() => null) : null;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/70 backdrop-blur-xl">
      {staffRole && <StaffBar role={staffRole} detail={agent?.code ?? null} />}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo />

        {/* Guests only: the intro sections exist only for them ("/" sends signed-in
            users to /brands), and the logo already takes signed-in users to the brands. */}
        {!profile && (
          <nav className="hidden items-center gap-8 text-sm font-semibold text-muted lg:flex" aria-label="Primary">
            <Link className="transition-colors hover:text-ocean" href="/#why-multife">Why MultiFe</Link>
            <Link className="transition-colors hover:text-ocean" href="/#how-it-works">How it works</Link>
            <Link className="transition-colors hover:text-ocean" href="/brands">Brands</Link>
          </nav>
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          {profile ? (
            <>
              {profile.role === "customer" && (
                <Link
                  href="/account/orders"
                  className="inline-flex h-11 items-center rounded-full px-3 text-sm font-semibold text-ocean hover:underline"
                >
                  My orders
                </Link>
              )}
              <span className="hidden max-w-[10rem] truncate text-sm text-muted md:inline">
                {profile.full_name ?? profile.email}
              </span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="inline-flex h-11 items-center rounded-full px-3 text-sm font-semibold text-ink transition-colors hover:text-ocean"
              >
                Sign in
              </Link>
              <Link
                href="/brands"
                className="hidden h-11 items-center justify-center rounded-full border border-white/30 bg-mf-blue px-5 text-sm font-semibold text-white shadow-blue transition-transform duration-200 hover:-translate-y-px sm:inline-flex"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
      {profile?.role === "agent" && <ActingForBar />}
    </header>
  );
}
