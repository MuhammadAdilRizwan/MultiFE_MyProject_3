import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentAgent } from "@multife/backend/modules/agents/getCurrentAgent";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/server";

// Always per-request: every page here reads the signed-in agent's session.
export const dynamic = "force-dynamic";

// Agent panel (SRS §6 agents). Middleware already limits /agent to the agent
// role; this re-checks so a suspended or half-set-up agent gets a clear page.
export default async function AgentLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  if (!profile) redirect("/sign-in?next=/agent");
  if (profile.role !== "agent" || profile.status !== "active") redirect("/");

  const agent = await getCurrentAgent(supabase);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            <span className="hidden rounded-full bg-mf-blue px-2.5 py-1 text-xs font-semibold text-white sm:inline">
              Agent
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-right text-sm text-muted md:inline">
              {profile.full_name ?? profile.email}
              {agent && <span className="ml-2 font-semibold text-ink">{agent.code}</span>}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {agent && agent.status === "active" ? (
          children
        ) : (
          <div className="mx-auto max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-card">
            <h1 className="font-display text-2xl text-ink">Your agent account isn&apos;t active</h1>
            <p className="mt-3 text-sm leading-6 text-muted">
              {agent
                ? "Your agent account has been suspended. Please contact the MultiFe admin team."
                : "Your agent profile hasn't been set up yet. Please contact the MultiFe admin team."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
