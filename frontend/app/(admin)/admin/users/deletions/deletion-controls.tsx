"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { completeAccountDeletionAction, declineAccountDeletionAction } from "./actions";

// Delete (after a second confirm) or decline (with a note) one pending
// deletion request. Delete is offered only when no order is in progress;
// the database refuses it anyway.

const small = "inline-flex h-9 items-center rounded-full border px-3 text-sm font-semibold transition-colors disabled:opacity-60";

export function DeletionControls({ requestId, name, openOrders }: { requestId: string; name: string; openOrders: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "confirm" | "decline">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => (setMode("idle"), setError(null));

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await completeAccountDeletionAction({ requestId });
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  function decline(event: FormEvent) {
    event.preventDefault();
    if (note.trim().length < 3) return setError("Tell the customer why.");
    setError(null);
    startTransition(async () => {
      const result = await declineAccountDeletionAction({ requestId, note });
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  if (mode === "confirm") {
    return (
      <div className="w-full rounded-2xl border border-danger/25 bg-danger-soft/40 p-3 sm:w-80">
        <p className="text-sm font-semibold text-ink">Delete {name}&apos;s account?</p>
        <p className="mt-0.5 text-xs leading-5 text-muted">
          Their sign-in, name, contact details, saved address and measurements are removed for good. Their orders stay
          without their details. This can&apos;t be undone.
        </p>
        {error && (
          <div className="mt-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={reset} disabled={pending} className={`${small} border-line bg-white text-ink`}>
            Cancel
          </button>
          <button type="button" onClick={remove} disabled={pending} className={`${small} border-transparent bg-danger text-white`}>
            {pending ? "Deleting…" : "Delete for good"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "decline") {
    return (
      <form onSubmit={decline} className="w-full rounded-2xl border border-line bg-cream/60 p-3 sm:w-80">
        <label htmlFor={`decline-${requestId}`} className="text-sm font-semibold text-ink">
          Decline this request?
        </label>
        <p className="mt-0.5 text-xs text-muted">The customer sees your note on their account page.</p>
        <input
          id={`decline-${requestId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="e.g. You have an open payment with us"
          className="mt-2 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-cyan-bright focus:outline-none focus:ring-4 focus:ring-cyan-bright/20"
        />
        {error && (
          <div className="mt-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={reset} disabled={pending} className={`${small} border-line bg-white text-ink`}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={`${small} border-transparent bg-mf-blue text-white`}>
            {pending ? "Declining…" : "Decline"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setMode("decline")} className={`${small} border-line bg-white text-ink hover:border-cyan-bright/60 hover:text-ocean`}>
          Decline
        </button>
        <button
          type="button"
          onClick={() => setMode("confirm")}
          disabled={openOrders > 0}
          className={`${small} border-danger/30 text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:hover:bg-transparent`}
        >
          Delete account
        </button>
      </div>
      {openOrders > 0 && (
        <p className="text-xs text-warning">
          Wait until their {openOrders} open {openOrders === 1 ? "order is" : "orders are"} delivered or cancelled.
        </p>
      )}
    </div>
  );
}
