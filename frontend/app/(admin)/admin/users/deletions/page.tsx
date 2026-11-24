import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import {
  listDeletionRequests,
  type AdminDeletionRequest,
  type DeletionRequestStatus,
} from "@multife/backend/modules/users/accountDeletion";
import { PageHeading } from "@/components/admin/list-controls";
import { BackLink } from "@/components/layout/back-link";
import { Alert } from "@/components/ui/alert";
import { activeAdmin } from "@/lib/active-admin";
import { formatOrderDate } from "@/lib/order-status";
import { formatPhone } from "@/lib/phone";
import { DeletionControls } from "./deletion-controls";

export const metadata: Metadata = { title: "Deletion requests" };

const OUTCOME: Record<Exclude<DeletionRequestStatus, "pending">, { label: string; className: string }> = {
  completed: { label: "Deleted", className: "bg-danger-soft text-danger" },
  declined: { label: "Declined", className: "bg-warning-soft text-warning" },
  withdrawn: { label: "Withdrawn by customer", className: "bg-cream text-ink" },
};

export default async function DeletionRequestsPage() {
  let result: { pending: AdminDeletionRequest[]; recent: AdminDeletionRequest[] } | null = null;
  try {
    const admin = await activeAdmin();
    if (admin) result = await listDeletionRequests(admin.supabase);
  } catch (error) {
    unstable_rethrow(error);
    console.error("listDeletionRequests failed:", (error as { message?: string })?.message ?? "unknown error");
  }

  return (
    <div>
      <BackLink href="/admin/users" label="Back to users" />
      <div className="mt-4">
        <PageHeading
          title="Deletion requests"
          text="Customers who asked us to delete their account. Deleting removes their sign-in, name, contact details, saved address and measurements; their orders stay without their details. You can delete once none of their orders is in progress, or decline with a note they'll see."
        />
      </div>

      {!result ? (
        <div className="mt-8">
          <Alert tone="danger">We couldn&apos;t load the deletion requests. Please refresh.</Alert>
        </div>
      ) : (
        <>
          <h2 className="mt-8 text-lg font-bold text-ink">Waiting ({result.pending.length})</h2>
          {result.pending.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No one is waiting for their account to be deleted.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {result.pending.map((r) => {
                const name = r.name || r.email || "Unnamed customer";
                return (
                  <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-card sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">{name}</p>
                      <p className="mt-0.5 truncate text-sm text-muted">
                        {[r.email, r.phone ? formatPhone(r.phone) : null].filter(Boolean).join(" · ") || "No contact details"}
                      </p>
                      <p className="text-xs text-hint">Asked {formatOrderDate(r.requestedAt)}</p>
                      {r.reason && <p className="mt-2 text-sm text-ink">&ldquo;{r.reason}&rdquo;</p>}
                      {r.openOrders > 0 && r.name && (
                        <Link href={`/admin/orders?status=open&q=${encodeURIComponent(r.name)}`} className="mt-1 inline-block text-sm font-semibold text-ocean hover:underline">
                          See their open orders →
                        </Link>
                      )}
                    </div>
                    <DeletionControls requestId={r.id} name={name} openOrders={r.openOrders} />
                  </li>
                );
              })}
            </ul>
          )}

          <h2 className="mt-10 text-lg font-bold text-ink">Recently handled</h2>
          {result.recent.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white shadow-card">
              {result.recent.map((r) => {
                const outcome = OUTCOME[r.status as keyof typeof OUTCOME];
                return (
                  <li key={r.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{r.name || r.email || "Unnamed customer"}</p>
                      <p className="text-xs text-hint">
                        Asked {formatOrderDate(r.requestedAt)}
                        {r.resolvedAt ? ` · handled ${formatOrderDate(r.resolvedAt)}` : ""}
                      </p>
                      {r.adminNote && <p className="mt-1 text-sm text-muted">Note: &ldquo;{r.adminNote}&rdquo;</p>}
                    </div>
                    {outcome && (
                      <span className={`w-fit flex-none rounded-full px-2.5 py-0.5 text-xs font-semibold ${outcome.className}`}>{outcome.label}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
