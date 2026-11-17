"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { MeasurementField } from "@multife/backend/modules/rules/validateMeasurements";
import { validateMeasurements } from "@multife/backend/modules/rules/validateMeasurements";
import {
  advanceStageAction,
  approveJobMeasurementsAction,
  recordFabricReceivedAction,
} from "@/app/(production)/production-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField, inputClasses } from "@/components/ui/text-field";
import type { JobSheet } from "@/lib/production-jobs";
import { changedMeasurements, maxMeasurementChange, sameMeasurements, type NextStep, type ProductionStage } from "@/lib/production-stage";

// The next step on a job sheet. Every button calls a server action; the
// database re-checks the role, the assignment and the allowed move.
export function JobActions({
  jobId,
  step,
  fields,
  measurements,
  threshold,
  correction,
}: {
  jobId: string;
  step: NextStep;
  fields: MeasurementField[];
  measurements: Record<string, number>;
  threshold: number;
  correction: JobSheet["correction"];
}) {
  if (step.kind === "wait" || step.kind === "closed") {
    return (
      <div className={`rounded-3xl border px-5 py-4 text-sm leading-6 ${step.kind === "closed" ? "border-line bg-white/70 text-muted" : "border-cyan-bright/30 bg-cyan-bright/10 text-ocean"}`}>
        {step.text}
      </div>
    );
  }
  if (step.kind === "receive") return <ReceiveFabric jobId={jobId} />;
  if (step.kind === "approve" && correction?.status === "pending") {
    return (
      <div className="rounded-3xl border border-cyan-bright/30 bg-cyan-bright/10 px-5 py-4 text-sm leading-6 text-ocean">
        Your corrections were sent to the customer on{" "}
        {new Date(correction.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}. Cutting waits until they
        accept. They&apos;re emailed and see it on their order page.
      </div>
    );
  }
  if (step.kind === "approve") {
    return <ApproveMeasurements jobId={jobId} fields={fields} confirmed={measurements} threshold={threshold} correction={correction} />;
  }
  if (step.kind === "qc") return <QualityCheck jobId={jobId} />;
  return <Advance jobId={jobId} to={step.to} label={step.label} hint={step.hint} />;
}

function NextStepCard({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-cyan-bright/40 bg-white p-5 shadow-card sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-ocean">Next step</p>
      <h2 className="mt-1 font-display text-2xl text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }
  return { error, pending, run };
}

function ReceiveFabric({ jobId }: { jobId: string }) {
  const { error, pending, run } = useAction();
  return (
    <NextStepCard title="Receive the fabric" text="The fabric has been secured from the store. Confirm once it's in the workshop.">
      {error && <div className="mb-3"><Alert tone="danger">{error}</Alert></div>}
      <Button type="button" pending={pending} pendingLabel="Saving…" onClick={() => run(() => recordFabricReceivedAction({ jobId }))} className="w-full sm:w-auto">
        Fabric received
      </Button>
    </NextStepCard>
  );
}

function Advance({ jobId, to, label, hint }: { jobId: string; to: ProductionStage; label: string; hint: string }) {
  const { error, pending, run } = useAction();
  return (
    <NextStepCard title={label} text={hint}>
      {error && <div className="mb-3"><Alert tone="danger">{error}</Alert></div>}
      <Button
        type="button"
        pending={pending}
        pendingLabel="Saving…"
        onClick={() => run(() => advanceStageAction({ jobId, toStage: to }))}
        className="w-full sm:w-auto"
      >
        {label}
      </Button>
    </NextStepCard>
  );
}


// QC's three outcomes: pass; fail back to stitching (fixable); or fail for
// good, which goes to the admin for a remake (FR-PRD-06). Both fails need a reason.
const QC_FAILS = {
  fix: { to: "stitching", label: "What needs fixing?", submit: "Send back to stitching", pending: "Sending back…" },
  remake: { to: "failed", label: "Why can't it be fixed?", submit: "Send for remake", pending: "Sending…" },
} as const;

function QualityCheck({ jobId }: { jobId: string }) {
  const { error, pending, run } = useAction();
  const [failing, setFailing] = useState<keyof typeof QC_FAILS | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  function sendBack(event: FormEvent) {
    event.preventDefault();
    if (!failing) return;
    if (reason.trim().length < 3) {
      setReasonError("Give a short reason.");
      return;
    }
    setReasonError(null);
    run(() => advanceStageAction({ jobId, toStage: QC_FAILS[failing].to, reason: reason.trim() }));
  }

  return (
    <NextStepCard title="Quality check" text="Check the finished outfit against the design and the approved measurements.">
      {error && <div className="mb-3"><Alert tone="danger">{error}</Alert></div>}
      {failing ? (
        <form onSubmit={sendBack} noValidate className="space-y-3">
          {failing === "remake" && (
            <Alert tone="warning">The admin team will be asked to order a remake. This outfit won&apos;t be shipped.</Alert>
          )}
          <TextField
            id="qc-reason"
            label={QC_FAILS[failing].label}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={reasonError ?? undefined}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" pending={pending} pendingLabel={QC_FAILS[failing].pending}>
              {QC_FAILS[failing].submit}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setFailing(null)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="button" pending={pending} pendingLabel="Saving…" onClick={() => run(() => advanceStageAction({ jobId, toStage: "passed" }))}>
            Pass — ready to ship
          </Button>
          <Button type="button" variant="secondary" onClick={() => setFailing("fix")} disabled={pending}>
            Fail — needs fixing
          </Button>
          <button
            type="button"
            onClick={() => setFailing("remake")}
            disabled={pending}
            className="h-12 rounded-full px-4 text-sm font-semibold text-danger hover:underline disabled:opacity-60"
          >
            Can&apos;t be fixed — needs remake
          </button>
        </div>
      )}
    </NextStepCard>
  );
}

function ApproveMeasurements({
  jobId,
  fields,
  confirmed,
  threshold,
  correction,
}: {
  jobId: string;
  fields: MeasurementField[];
  confirmed: Record<string, number>;
  threshold: number;
  correction: JobSheet["correction"];
}) {
  const { error, pending, run } = useAction();
  const accepted = correction?.status === "accepted" ? correction.proposed : null;
  // Once the customer accepted a correction, start from those values.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, (accepted ?? confirmed)[f.key]?.toString() ?? ""])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState(correction?.status === "accepted" ? correction.reason : "");
  const [formError, setFormError] = useState<string | null>(null);

  const numeric = Object.fromEntries(
    Object.entries(values).filter(([, v]) => v.trim() !== "" && !Number.isNaN(Number(v))).map(([k, v]) => [k, Number(v)]),
  );
  const changed = changedMeasurements(confirmed, numeric);
  // FR-AI-16: beyond the threshold the customer has to accept first.
  const needsCustomer = maxMeasurementChange(confirmed, numeric) > threshold && !(accepted && sameMeasurements(accepted, numeric));

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const checked = validateMeasurements(fields, values);
    if (!checked.ok) {
      setErrors(checked.errors);
      document.getElementById(`pm-${Object.keys(checked.errors)[0]}`)?.focus();
      return;
    }
    setErrors({});
    if (changed.length > 0 && reason.trim().length < 3) {
      setFormError("You changed some measurements. Say why, so the change is on record.");
      return;
    }
    run(() => approveJobMeasurementsAction({ jobId, values: checked.values, reason: reason.trim() || undefined }));
  }

  return (
    <NextStepCard
      title="Approve measurements"
      text="Check the customer's measurements. Correct any that are wrong — the customer's own set is kept. Cutting can't start until these are approved."
    >
      <form onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((f) => (
            <TextField
              key={f.key}
              id={`pm-${f.key}`}
              label={`${f.label} (${f.unit})`}
              type="number"
              inputMode="decimal"
              step="0.1"
              min={f.min}
              max={f.max}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              error={errors[f.key]}
              hint={changed.includes(f.key) ? `Changed from ${confirmed[f.key]}` : `Between ${f.min} and ${f.max}`}
            />
          ))}
        </div>

        {correction?.status === "accepted" && (
          <div className="mt-4">
            <Alert tone="success">The customer accepted your corrections. Approve them to start cutting.</Alert>
          </div>
        )}
        {correction?.status === "declined" && (
          <div className="mt-4">
            <Alert tone="warning">
              The customer declined your last corrections{correction.responseNote ? `: “${correction.responseNote}”` : "."} The admin
              team will agree the measurements with them. You can approve the customer&apos;s own set, or send new corrections.
            </Alert>
          </div>
        )}
        {needsCustomer && (
          <div className="mt-4">
            <Alert tone="info">
              A change of more than {threshold} cm goes to the customer to accept before cutting. They&apos;re emailed and the order waits.
            </Alert>
          </div>
        )}

        {changed.length > 0 && (
          <div className="mt-4">
            <label htmlFor="pm-reason" className="text-sm font-semibold text-ink">
              Why did you change {changed.length === 1 ? "this measurement" : "these measurements"}?
            </label>
            <textarea
              id="pm-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Re-measured at the fitting; chest was 2 cm larger"
              className={`${inputClasses} mt-1.5 h-auto py-3`}
            />
          </div>
        )}

        {(formError || error) && (
          <div className="mt-4">
            <Alert tone="danger">{formError ?? error}</Alert>
          </div>
        )}

        <Button type="submit" pending={pending} pendingLabel={needsCustomer ? "Sending…" : "Approving…"} className="mt-5 w-full sm:w-auto">
          {needsCustomer ? "Send corrections to customer" : changed.length > 0 ? "Approve with corrections" : "Approve measurements"}
        </Button>
      </form>
    </NextStepCard>
  );
}
