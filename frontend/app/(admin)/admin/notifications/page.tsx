import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/admin/list-controls";
import { NotificationControls, NotificationRowActions } from "@/components/admin/notification-controls";
import { Alert } from "@/components/ui/alert";
import { isEmailConfigured } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  order_placed: "Order confirmed",
  order_cancelled: "Order cancelled",
  measurement_correction: "Measurement correction",
  order_dispatched: "On its way",
  delivery_failed: "Delivery failed",
  ready_for_collection: "Ready to collect",
  order_delivered: "Delivered",
};

// "ayesha@gmail.com" -> "ay•••@gmail.com": enough to recognise, not to copy.
const mask = (r: string) => {
  const [user, domain] = r.split("@");
  return domain ? `${user.slice(0, 2)}•••@${domain}` : `${r.slice(0, 4)}•••`;
};

type Row = {
  id: string;
  template: string;
  recipient: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  order: { number: string } | null;
};

// FR-NOT-03: the email queue. Admin session ("notification_outbox: admin read").
export default async function NotificationsPage() {
  const supabase = await createClient();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const count = (status: string, since?: string) => {
    let q = supabase.from("notification_outbox").select("id", { count: "exact", head: true }).eq("status", status).eq("channel", "email");
    if (since) q = q.gte("created_at", since);
    return q;
  };
  const [pending, failed, sent, failedRows] = await Promise.all([
    count("pending"),
    count("failed"),
    count("sent", weekAgo),
    supabase
      .from("notification_outbox")
      .select("id, template, recipient, status, attempts, last_error, created_at, order:orders(number)")
      .eq("status", "failed")
      .eq("channel", "email")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const loadError = pending.error || failed.error || sent.error || failedRows.error;
  const configured = isEmailConfigured();

  return (
    <div>
      <PageHeading title="Notifications" text="Emails to customers about their orders. They're queued, sent in the background and retried if the provider fails." />

      {loadError ? (
        <div className="mt-8">
          <Alert tone="danger">We couldn&apos;t load the notifications. Please refresh.</Alert>
        </div>
      ) : (
        <>
          {!configured && (
            <div className="mt-6">
              <Alert tone="warning">
                Email isn&apos;t switched on yet, so emails stay queued. Add <span className="font-mono">RESEND_API_KEY</span> and{" "}
                <span className="font-mono">NOTIFY_FROM_EMAIL</span> (a sender on a domain verified in Resend) to the server&apos;s
                environment. Discard test orders&apos; queued emails first so they aren&apos;t sent.
              </Alert>
            </div>
          )}

          <dl className="mt-6 grid grid-cols-3 gap-3">
            <Stat label="Queued" value={pending.count ?? 0} />
            <Stat label="Failed" value={failed.count ?? 0} danger={(failed.count ?? 0) > 0} />
            <Stat label="Sent this week" value={sent.count ?? 0} />
          </dl>

          <div className="mt-4">
            <NotificationControls configured={configured} queued={pending.count ?? 0} />
          </div>

          <section className="mt-6 rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
            <h2 className="font-display text-xl text-ink">Failed emails</h2>
            <p className="mt-1 text-sm text-muted">Gave up after 5 attempts. Retry once the problem is fixed (e.g. a typo in the address).</p>
            {(failedRows.data ?? []).length === 0 ? (
              <p className="mt-4 text-sm text-muted">No failed emails.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {((failedRows.data ?? []) as unknown as Row[]).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        {LABELS[r.template] ?? r.template}
                        {r.order && (
                          <>
                            {" · "}
                            <Link href={`/admin/orders/${r.order.number}`} className="text-ocean hover:underline">
                              {r.order.number}
                            </Link>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        To {mask(r.recipient)} · {r.attempts} attempts{r.last_error && ` · ${r.last_error}`}
                      </p>
                    </div>
                    <NotificationRowActions id={r.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-3xl border border-line bg-white p-4 shadow-card sm:p-5">
      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className={`mt-2 font-display text-2xl sm:text-3xl ${danger ? "text-danger" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
