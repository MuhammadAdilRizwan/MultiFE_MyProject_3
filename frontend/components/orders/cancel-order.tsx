"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { cancelMyOrderAction } from "@/app/(customer)/account/orders/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CANCEL_REASONS } from "@/lib/order-status";

// FR-CUS-14: the customer cancels before cutting starts. Asks for a reason
// and a deliberate second tap; the server and database re-check everything.
export function CancelOrder({ orderNumber, isCod }: { orderNumber: string; isCod: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof CANCEL_REASONS)[number] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!reason) return setError("Choose a reason for cancelling.");
    if (reason === "Other" && note.trim().length < 3) return setError("Tell us briefly why you're cancelling.");
    startTransition(async () => {
      const result = await cancelMyOrderAction({ orderNumber, reason, note: note.trim() || undefined });
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-sm text-muted">Changed your mind? You can cancel until cutting starts.</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 items-center rounded-full border border-danger/30 px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft"
        >
          Cancel order
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 border-t border-line pt-4" aria-labelledby="cancel-title">
      <h3 id="cancel-title" className="text-base font-bold text-ink">
        Cancel order {orderNumber}?
      </h3>
      <p className="mt-1 text-sm text-muted">
        {isCod ? "Nothing has been charged, so there's nothing to pay." : "Your payment will be refunded."} This can&apos;t be
        undone.
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-ink">Why are you cancelling?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {CANCEL_REASONS.map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm transition-colors ${
                reason === r ? "border-cyan-bright bg-cyan-bright/5 font-semibold text-ink" : "border-line text-ink hover:border-cyan-bright/60"
              }`}
            >
              <input type="radio" name="cancel-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-ocean" />
              {r}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="cancel-note" className="mt-4 block text-sm font-medium text-ink">
        {reason === "Other" ? "Tell us more" : "Anything else? (optional)"}
      </label>
      <textarea
        id="cancel-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        rows={2}
        className="mt-1.5 block w-full rounded-[14px] border border-line bg-white/90 px-4 py-3 text-base text-ink focus:border-cyan-bright focus:outline-none focus:ring-4 focus:ring-cyan-bright/20"
      />

      {error && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
          Keep my order
        </Button>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className="inline-flex h-12 items-center justify-center rounded-full bg-danger px-7 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Cancelling…" : "Yes, cancel order"}
        </button>
      </div>
    </form>
  );
}
