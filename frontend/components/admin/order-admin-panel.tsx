"use client";

import { useState, useTransition, type FormEvent } from "react";
import { addOrderNoteAction, adminCancelOrderAction } from "@/app/(admin)/admin/orders/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField, inputClasses } from "@/components/ui/text-field";
import type { OrderAdminRecord, OrderRecordEntry } from "@/lib/admin-order-record";
import { auditActionLabel, auditSummary } from "@/lib/audit-labels";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

const NOTE_LABEL: Record<Exclude<OrderRecordEntry["kind"], "audit">, string> = {
  note: "Internal note",
  dispute_opened: "Dispute opened",
  dispute_resolved: "Dispute resolved",
};

// FR-ADM-06 / UC-12 on the admin order page: cancel with a reason, internal
// notes (customers never see them), open / resolve a dispute, and the order's
// audit trail.
export function OrderAdminPanel({ orderNumber, record }: { orderNumber: string; record: OrderAdminRecord }) {
  const { orderId, status, disputeOpenedAt, entries } = record;
  const closed = ["delivered", "cancelled", "failed"].includes(status);
  const disputeOpen = disputeOpenedAt !== null;

  return (
    <section aria-labelledby="admin-actions-heading" className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="admin-actions-heading" className="font-display text-2xl text-ink">
          Notes, disputes &amp; history
        </h2>
        {disputeOpen && (
          <span className="rounded-full bg-danger-soft px-3 py-1 text-xs font-bold text-danger">Dispute open since {when(disputeOpenedAt)}</span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">Only admins see this. Every note, dispute and cancellation is written to the audit log.</p>

      <NoteForm orderId={orderId} orderNumber={orderNumber} disputeOpen={disputeOpen} />

      {!closed && <CancelOrder orderId={orderId} orderNumber={orderNumber} />}

      <h3 className="mt-6 text-sm font-bold text-ink">History</h3>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {entries.map((e) => {
            const summary = e.kind === "audit" ? auditSummary(e.before, e.after) : e.body;
            return (
              <li key={`${e.kind}-${e.id}`} className="py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span
                    className={`font-semibold ${
                      e.kind === "dispute_opened" ? "text-danger" : e.kind === "dispute_resolved" ? "text-success" : "text-ink"
                    }`}
                  >
                    {e.kind === "audit" ? auditActionLabel(e.action ?? "") : NOTE_LABEL[e.kind]}
                  </span>
                  <time dateTime={e.at} className="text-xs text-muted">
                    {when(e.at)}
                  </time>
                </div>
                {summary && <p className="mt-0.5 whitespace-pre-line text-ink">{summary}</p>}
                <p className="text-xs text-muted">by {e.by ?? "the system"}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function NoteForm({ orderId, orderNumber, disputeOpen }: { orderId: string; orderNumber: string; disputeOpen: boolean }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(kind: "note" | "dispute_opened" | "dispute_resolved") {
    setError(null);
    if (body.trim().length < 3) {
      setError(kind === "note" ? "Write the note first." : "Say what the dispute is about, or how it was resolved.");
      return;
    }
    start(async () => {
      const result = await addOrderNoteAction({ orderId, orderNumber, kind, body: body.trim() });
      if (!result.ok) setError(result.error);
      else setBody("");
    });
  }

  return (
    <div className="mt-4">
      <label htmlFor="order-note" className="text-sm font-semibold text-ink">
        Note
      </label>
      <textarea
        id="order-note"
        rows={3}
        maxLength={1000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={disputeOpen ? "e.g. Agreed a free alteration with the customer" : "e.g. Customer called: wants delivery after 5 pm"}
        className={`${inputClasses} mt-1.5 h-auto py-3 text-sm`}
      />
      {error && (
        <div className="mt-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" pending={pending} pendingLabel="Saving…" onClick={() => save("note")} className="h-10 px-4 text-sm">
          Add note
        </Button>
        {disputeOpen ? (
          <Button type="button" pending={pending} pendingLabel="Saving…" onClick={() => save("dispute_resolved")} className="h-10 px-4 text-sm">
            Resolve dispute
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            pending={pending}
            pendingLabel="Saving…"
            onClick={() => save("dispute_opened")}
            className="h-10 px-4 text-sm text-danger"
          >
            Open dispute
          </Button>
        )}
      </div>
    </div>
  );
}

function CancelOrder({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (reason.trim().length < 3) {
      setError("Give a reason for cancelling.");
      return;
    }
    start(async () => {
      const result = await adminCancelOrderAction({ orderId, orderNumber, reason: reason.trim() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setDone(
        result.data.paymentStatus === "refund_pending"
          ? "Order cancelled. It was paid, so a refund has been recorded as pending."
          : "Order cancelled. The customer is emailed and the fabric hold is released.",
      );
    });
  }

  return (
    <div className="mt-5 rounded-2xl border border-danger/20 p-4">
      {done ? (
        <Alert tone="success">{done}</Alert>
      ) : open ? (
        <form onSubmit={submit} noValidate className="space-y-3">
          <TextField
            id="admin-cancel-reason"
            label="Why is this order being cancelled?"
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={error ?? undefined}
          />
          <p className="text-xs text-muted">
            The customer is emailed with this reason, the fabric hold is released and, if they paid, a refund is recorded.
            This can&apos;t be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" pending={pending} pendingLabel="Cancelling…" className="h-10 px-4 text-sm">
              Cancel order
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending} className="h-10 px-4 text-sm">
              Keep order
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">Cancel at any point before delivery, with a reason.</p>
          <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-danger hover:underline">
            Cancel this order…
          </button>
        </div>
      )}
    </div>
  );
}
