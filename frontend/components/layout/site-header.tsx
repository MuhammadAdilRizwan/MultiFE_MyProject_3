import Link from "next/link";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const profile = await getCurrentProfile(await createClient());

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo />

        <nav className="hidden items-center gap-8 text-sm font-semibold text-muted lg:flex" aria-label="Primary">
          <Link className="transition-colors hover:text-ocean" href="/#why-multife">Why MultiFe</Link>
          <Link className="transition-colors hover:text-ocean" href="/#how-it-works">How it works</Link>
          <Link className="transition-colors hover:text-ocean" href="/#brands">Brands</Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {profile ? (
            <>
              {profile.role === "admin" && (
                <Link
                  href="/admin"
                  className="hidden h-11 items-center rounded-full px-3 text-sm font-semibold text-ocean hover:underline sm:inline-flex"
                >
                  Admin
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
                href="/#brands"
                className="hidden h-11 items-center justify-center rounded-full border border-white/30 bg-mf-blue px-5 text-sm font-semibold text-white shadow-blue transition-transform duration-200 hover:-translate-y-px sm:inline-flex"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
