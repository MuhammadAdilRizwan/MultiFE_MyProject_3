import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { listMyCustomersAction, listMyVisitsAction } from "@/app/(agent)/agent-actions";
import { AgentVisits } from "./agent-visits";

export const metadata: Metadata = { title: "Measurement visits" };

// FR-AGT-12: book and record measurement visits for customers who can't
// complete a scan themselves.
export default async function VisitsPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const [{ customer }, visits, customers] = await Promise.all([searchParams, listMyVisitsAction(), listMyCustomersAction()]);

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean">Agent panel</p>
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">Measurement visits</h1>
        <p className="text-sm text-muted">
          Visit customers who can&apos;t measure themselves. What you record is saved to their profile for their next order.
        </p>
      </div>
      <div className="mt-8">
        {visits.ok && customers.ok ? (
          <AgentVisits visits={visits.data} customers={customers.data} preselectedCustomerId={customer ?? null} />
        ) : (
          <Alert tone="danger">We couldn&apos;t load your visits. Please refresh to try again.</Alert>
        )}
      </div>
    </div>
  );
}
