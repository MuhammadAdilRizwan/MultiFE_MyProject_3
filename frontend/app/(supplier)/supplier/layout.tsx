import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand/logo";
import { ViewBrandsLink } from "@/components/layout/workspace-switch";
import { SupplierNav } from "@/components/supplier/supplier-nav";
import { logMessage } from "@/lib/describe-error";
import { createClient } from "@/lib/supabase/server";
import { getMyStore, type MyStore } from "@/lib/supplier-panel";

// Always per-request: every page here reads the signed-in contact's store.
export const dynamic = "force-dynamic";

// Supplier panel (SDS §2.1: fabric list, sync status, supply requirements).
// Middleware already limits /supplier to supplier contacts; this re-checks so
// a suspended or not-yet-linked contact gets a clear page.
export default async function SupplierLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  if (!profile) redirect("/sign-in?next=/supplier");
  if (profile.role !== "supplier_contact" || profile.status !== "active") redirect("/");

  let store: MyStore | null = null;
  let failed = false;
  try {
    store = await getMyStore();
  } catch (error) {
    failed = true;
    console.error("getMyStore failed:", logMessage(error));
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            <span className="hidden rounded-full bg-mf-blue px-2.5 py-1 text-xs font-semibold text-white sm:inline">
              Supplier
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ViewBrandsLink />
            <span className="hidden max-w-[16rem] truncate text-right text-sm text-muted md:inline">
              {profile.full_name ?? profile.email}
              {store && <span className="ml-2 font-semibold text-ink">{store.name}</span>}
            </span>
            <SignOutButton />
          </div>
        </div>
        {store && <SupplierNav />}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {store ? (
          children
        ) : (
          <div className="mx-auto max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-card">
            <h1 className="font-display text-2xl text-ink">
              {failed ? "We couldn't load your store" : "Your account isn't linked to a store yet"}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted">
              {failed
                ? "Please refresh to try again. If it keeps happening, contact the MultiFe admin team."
                : "Please contact the MultiFe admin team to link your account to your store."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
