"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { STANDARD_MEASUREMENTS } from "@multife/backend/modules/rules/standardMeasurements";
import { respondToCorrectionAction } from "@/app/(customer)/account/orders/correction-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import type { OrderDetail } from "@/lib/customer-orders";

const LABELS = new Map(STANDARD_MEASUREMENTS.map((f) => [f.key, f.label]));
const label = (key: string) => LABELS.get(key) ?? key.replace(/_/g, " ");

// FR-AI-16: the workshop suggests different measurements before cutting.
// The customer (or their agent) sees old vs new and accepts or declines;
// the order is paused until then.
export function MeasurementCorrectionCard({
  correction,
  canRespond,
  audience,
}: {
  correction: NonNullable<OrderDetail["correction"]>;
  canRespond: boolean;
  audience: "customer" | "agent" | "admin";
}) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const changed = Object.keys(correction.proposed).filter((k) => correction.original[k] !== correction.proposed[k]);
  const whose = audience === "agent" ? "the customer's" : audience === "admin" ? "the customer's" : "your";

  function answer(accept: boolean) {
    setError(null);
    start(async () => {
      const result = await respondToCorrectionAction({ correctionId: correction.id, accept, note: accept ? undefined : note.trim() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function decline(event: FormEvent) {
    event.preventDefault();
    if (note.trim().length < 3) {
      setError("Tell us what's wrong so we can contact you.");
      return;
    }
    answer(false);
  }

  const tone =
    correction.status === "pending" ? "border-warning/40" : correction.status === "declined" ? "border-danger/25" : "border-success/25";

  return (
    <section aria-labelledby="correction-heading" className={`rounded-3xl border bg-white p-5 shadow-card sm:p-6 ${tone}`}>
      <h2 id="correction-heading" className="font-display text-2xl text-ink">
        {correction.status === "pending"
          ? `Please check ${whose} measurements`
          : correction.status === "declined"
            ? "Measurement change declined"
            : "Measurement change accepted"}
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        {correction.status === "pending"
          ? `Our tailor checked ${whose} measurements and suggests these changes before cutting. The order is paused until ${audience === "customer" ? "you answer" : "this is answered"}.`
          : correction.status === "declined"
            ? "Our team will contact the customer to agree the measurements before cutting."
            : "The tailor will now approve the new measurements and start cutting."}
      </p>

      <p className="mt-3 rounded-2xl bg-cream/70 px-4 py-3 text-sm text-ink">
        <span className="font-semibold">Tailor&apos;s note:</span> {correction.reason}
      </p>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 font-semibold">Measurement</th>
            <th className="py-1 font-semibold">Was</th>
            <th className="py-1 font-semibold">Suggested</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {changed.map((k) => (
            <tr key={k}>
              <td className="py-2 font-semibold text-ink">{label(k)}</td>
              <td className="py-2 text-muted">{correction.original[k] ?? "—"} cm</td>
              <td className="py-2 font-bold text-ocean">{correction.proposed[k]} cm</td>
            </tr>
          ))}
        </tbody>
      </table>

      {correction.status === "declined" && correction.responseNote && (
        <p className="mt-3 text-sm text-muted">Reply: “{correction.responseNote}”</p>
      )}

      {error && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {correction.status === "pending" && canRespond && (
        <div className="mt-5">
          {declining ? (
            <form onSubmit={decline} noValidate className="space-y-3">
              <TextField
                id="correction-note"
                label="What's wrong with the suggested measurements?"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. My chest is 90 cm, I measured it again"
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" pending={pending} pendingLabel="Sending…">
                  Decline the changes
                </Button>
                <Button type="button" variant="secondary" onClick={() => setDeclining(false)} disabled={pending}>
                  Back
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" pending={pending} pendingLabel="Saving…" onClick={() => answer(true)}>
                Accept the changes
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDeclining(true)} disabled={pending}>
                Something&apos;s not right
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
