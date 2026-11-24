"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { MyDeletionState } from "@multife/backend/modules/users/accountDeletion";
import {
  requestAccountDeletionAction,
  withdrawAccountDeletionAction,
} from "@/app/(customer)/account/profile/deletion-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatOrderDate } from "@/lib/order-status";

// FR-AUTH-09: "Delete my account" on My details. The customer asks; an admin
// carries it out (or declines with a note). Until then they can withdraw.

const plural = (n: number) => `${n} ${n === 1 ? "order" : "orders"}`;

export function DeleteAccount({ initial }: { initial: MyDeletionState }) {
  const [state, setState] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { request, openOrders } = state;
  const isPending = request?.status === "pending";

  function send(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestAccountDeletionAction({ reason });
      if (!result.ok) return setError(result.error);
      setState(result.data);
      setAsking(false);
      setReason("");
    });
  }

  function withdraw() {
    setError(null);
    startTransition(async () => {
      const result = await withdrawAccountDeletionAction();
      if (!result.ok) return setError(result.error);
      setState(result.data);
    });
  }

  return (
    <section
      aria-labelledby="delete-account-heading"
      className="mt-8 rounded-3xl border border-danger/20 bg-white/80 p-5 shadow-card backdrop-blur-xl sm:p-7"
    >
      <h2 id="delete-account-heading" className="text-lg font-bold text-ink">
        Delete my account
      </h2>

      {isPending ? (
        <>
          <p className="mt-2 text-sm leading-6 text-muted">
            You asked us to delete your account on {formatOrderDate(request.requestedAt)}.{" "}
            {openOrders > 0
              ? `We'll delete it once your ${plural(openOrders)} in progress ${openOrders === 1 ? "is" : "are"} delivered or cancelled.`
              : "An admin will delete it soon."}{" "}
            Until then you can sign in and use your account as normal.
          </p>
          {error && (
            <div className="mt-4">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          <div className="mt-5">
            <Button type="button" variant="secondary" onClick={withdraw} pending={pending} pendingLabel="Withdrawing…" className="w-full sm:w-auto">
              Withdraw my request
            </Button>
          </div>
        </>
      ) : (
        <>
          {request?.status === "declined" && (
            <div className="mt-3">
              <Alert tone="warning">
                We didn&apos;t delete your account
                {request.resolvedAt ? ` (${formatOrderDate(request.resolvedAt)})` : ""}: {request.adminNote}
              </Alert>
            </div>
          )}
          <p className="mt-2 text-sm leading-6 text-muted">
            Ask us to delete your MultiFe account. An admin checks the request and deletes it.
          </p>

          {!asking ? (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setAsking(true)}
                className="inline-flex h-12 w-full items-center justify-center rounded-full border border-danger/30 bg-white px-7 text-base font-semibold text-danger transition-colors hover:bg-danger-soft sm:w-auto"
              >
                Ask to delete my account
              </button>
            </div>
          ) : (
            <form onSubmit={send} className="mt-5 rounded-2xl border border-danger/25 bg-danger-soft/40 p-4 sm:p-5">
              <p className="text-sm font-semibold text-ink">When your account is deleted:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink">
                <li>You can&apos;t sign in again. This can&apos;t be undone.</li>
                <li>Your name, email, phone, saved address and measurements are removed.</li>
                <li>Your past orders stay in our records, without your name or contact details.</li>
              </ul>
              {openOrders > 0 && (
                <p className="mt-3 text-sm leading-6 text-ink">
                  You have {plural(openOrders)} in progress. We&apos;ll delete your account after{" "}
                  {openOrders === 1 ? "it is" : "they are"} delivered or cancelled.
                </p>
              )}

              <label htmlFor="delete-reason" className="mt-4 block text-sm font-medium text-ink">
                Why are you leaving? (optional)
              </label>
              <textarea
                id="delete-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={2}
                className="mt-1.5 block w-full rounded-[14px] border border-line bg-white/90 px-4 py-3 text-base text-ink focus:border-cyan-bright focus:outline-none focus:ring-4 focus:ring-cyan-bright/20"
              />

              {error && (
                <div className="mt-4">
                  <Alert tone="danger">{error}</Alert>
                </div>
              )}

              <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => (setAsking(false), setError(null))}
                  disabled={pending}
                  className="w-full sm:w-auto"
                >
                  Keep my account
                </Button>
                <button
                  type="submit"
                  disabled={pending}
                  aria-busy={pending || undefined}
                  className="inline-flex h-12 w-full items-center justify-center rounded-full bg-danger px-7 text-base font-semibold text-white transition-opacity disabled:opacity-60 sm:w-auto"
                >
                  {pending ? "Sending…" : "Send request"}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
