import Link from "next/link";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const profile = await getCurrentProfile(await createClient());

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo />

        <nav className="hidden items-center gap-8 text-sm font-medium text-muted-strong lg:flex" aria-label="Primary">
          <Link className="transition-colors hover:text-ocean" href="/#how-it-works">How it works</Link>
          <Link className="transition-colors hover:text-ocean" href="/#brands">Brands</Link>
          <Link className="transition-colors hover:text-ocean" href="/#why-multife">Why MultiFe</Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {profile ? (
            <>
              {profile.role === "admin" && (
                <Link
                  href="/admin/invite"
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
                className="inline-flex h-11 items-center rounded-full px-3 text-sm font-semibold text-navy transition-colors hover:text-ocean"
              >
                Sign in
              </Link>
              <Link
                href="/#brands"
                className="hidden h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-ocean sm:inline-flex"
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
