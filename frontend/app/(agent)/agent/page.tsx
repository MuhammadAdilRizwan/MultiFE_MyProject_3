import type { Metadata } from "next";
import { getCurrentAgent } from "@multife/backend/modules/agents/getCurrentAgent";
import { Alert } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";
import { listMyCustomersAction } from "@/app/(agent)/agent-actions";
import { AgentCustomers } from "./agent-customers";

export const metadata: Metadata = { title: "Agent panel" };

export default async function AgentPage() {
  const [agent, result] = await Promise.all([getCurrentAgent(await createClient()), listMyCustomersAction()]);

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean">Agent panel</p>
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">My customers</h1>
        <p className="text-sm text-muted">
          {agent?.region ? `${agent.region} · ` : ""}Add the customers you serve and keep track of them here.
        </p>
      </div>

      <div className="mt-8">
        {result.ok ? (
          <AgentCustomers customers={result.data} />
        ) : (
          <Alert tone="danger">We couldn&apos;t load your customers. Please refresh to try again.</Alert>
        )}
      </div>
    </div>
  );
}
