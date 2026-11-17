import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand/logo";
import { ROLE_LABELS, isProductionRole } from "@/lib/production-stage";
import { createClient } from "@/lib/supabase/server";

// Always per-request: every page here reads the signed-in staff member's jobs.
export const dynamic = "force-dynamic";

// Production panel (SRS §9, FR-PRD-*): tailors, QC and dispatch. Middleware
// already limits /production to those roles; this re-checks so a suspended
// account is turned away here too.
export default async function ProductionLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  if (!profile) redirect("/sign-in?next=/production");
  if (!isProductionRole(profile.role) || profile.status !== "active") redirect("/");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-white/70 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            <span className="hidden rounded-full bg-mf-blue px-2.5 py-1 text-xs font-semibold text-white sm:inline">
              Production
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden max-w-[16rem] truncate text-right text-sm text-muted md:inline">
              {profile.full_name ?? profile.email}
              <span className="ml-2 font-semibold text-ink">{ROLE_LABELS[profile.role]}</span>
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8 print:max-w-none print:p-0">
        {children}
      </main>
    </div>
  );
}
