import { redirect } from "next/navigation";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { Logo } from "@/components/brand/logo";
import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile(await createClient());

  if (!profile) redirect("/sign-in?next=/admin");
  if (profile.role !== "admin" || profile.status !== "active") redirect("/");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            <span className="hidden rounded-full bg-mf-orange px-2.5 py-1 text-xs font-semibold text-white sm:inline">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-sm text-muted md:inline">
              {profile.full_name ?? profile.email}
            </span>
            <SignOutButton />
          </div>
        </div>
        <AdminNav />
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {children}
      </main>
    </div>
  );
}
