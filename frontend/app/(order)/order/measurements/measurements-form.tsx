"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { validateMeasurements } from "@multife/backend/modules/rules/validateMeasurements";
import {
  getMeasurementStepAction,
  recordConsentAction,
  saveMeasurementsAction,
  type MeasurementStep,
} from "@/app/(order)/checkout-actions";
import { ActionBar, ArrowIcon } from "@/components/order/action-bar";
import { OrderGate, type OrderContext } from "@/components/order/order-gate";
import { StepPrompt, StepSpinner } from "@/components/order/order-states";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { PageTitle } from "@/components/order/page-title";
import { useSyncedDraft } from "@/components/order/use-synced-draft";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { fabricName } from "@/lib/catalog";

export function MeasurementsPage() {
  return <OrderGate needTemplate>{(ctx) => <Measurements ctx={ctx} />}</OrderGate>;
}

function Measurements({ ctx }: { ctx: OrderContext }) {
  const synced = useSyncedDraft(ctx);
  const { brand, template, fabric, orderingFor } = ctx;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <OrderTopBar backHref="/order/review" storeName={brand.name} />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <PageTitle
            label="Sizing"
            title={orderingFor ? `${orderingFor.name}'s Measurements` : "Your Measurements"}
            subtitle={
              orderingFor
                ? `For ${orderingFor.name}'s ${template?.name} in ${fabricName(fabric)}. Take each measurement with the customer present.`
                : `For your ${template?.name} in ${fabricName(fabric)}. Your outfit is cut to these, so measure carefully.`
            }
          />
          <div className="mt-8">
            {synced.status === "guest" ? (
              <StepPrompt
                text="Sign in with your customer account to add your measurements. Your design is kept."
                href="/sign-in?next=/order/measurements"
                action="Sign in to continue"
              />
            ) : synced.status === "agent-no-customer" ? (
              <StepPrompt text="To order for someone, start from that customer in your agent panel." href="/agent" action="Go to my customers" />
            ) : synced.status === "repick" ? (
              <StepPrompt
                text="Some of your style choices are no longer offered for this fabric. Please choose again first."
                href="/order/review"
                action="Back to review"
              />
            ) : synced.status === "error" ? (
              <Alert tone="danger">{synced.error}</Alert>
            ) : synced.status === "loading" ? (
              <StepSpinner />
            ) : (
              <MeasurementLoader draftId={synced.draftId} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function MeasurementLoader({ draftId }: { draftId: string }) {
  const [step, setStep] = useState<{ draftId: string; result: Awaited<ReturnType<typeof getMeasurementStepAction>> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMeasurementStepAction({ draftId })
      .then((result) => !cancelled && setStep({ draftId, result }))
      .catch(() => !cancelled && setStep({ draftId, result: { ok: false, error: "We couldn't load your order. Please try again." } }));
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  if (step?.draftId !== draftId) return <StepSpinner />;
  if (!step.result.ok) return <Alert tone="danger">{step.result.error}</Alert>;
  return <ConsentThenForm draftId={draftId} step={step.result.data} />;
}

// FR-AGT-07: an agent records the customer's consent before taking their
// measurements; customers go straight to the form.
function ConsentThenForm({ draftId, step }: { draftId: string; step: MeasurementStep }) {
  const [consented, setConsented] = useState(step.consentRecorded);
  return consented ? (
    <MeasurementForm draftId={draftId} step={step} />
  ) : (
    <ConsentCard draftId={draftId} onRecorded={() => setConsented(true)} />
  );
}

const CONSENT_METHODS = [
  { value: "in_person", label: "In person", hint: "The customer is with me now." },
  { value: "phone_call", label: "On a phone call", hint: "The customer agreed by phone." },
  { value: "signed_form", label: "Signed form", hint: "The customer signed a consent form." },
] as const;

function ConsentCard({ draftId, onRecorded }: { draftId: string; onRecorded: () => void }) {
  const [method, setMethod] = useState<(typeof CONSENT_METHODS)[number]["value"]>("in_person");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!agreed) {
      setError("Confirm the customer has agreed before continuing.");
      return;
    }
    startSaving(async () => {
      const result = await recordConsentAction({ draftId, method, agreed: true });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onRecorded();
    });
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-line bg-white/80 p-5 shadow-card backdrop-blur-xl sm:p-7">
      <h2 className="font-display text-2xl text-ink">Customer consent</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Before you take measurements or place this order, the customer must agree to you doing it for them. This is
        recorded on the order.
      </p>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-ink">How did the customer agree?</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {CONSENT_METHODS.map((m) => (
            <label
              key={m.value}
              className={`flex cursor-pointer flex-col rounded-2xl border p-3 text-sm transition-colors ${
                method === m.value ? "border-cyan-bright bg-cyan-bright/5" : "border-line hover:border-cyan-bright/60"
              }`}
            >
              <span className="flex items-center gap-2 font-semibold text-ink">
                <input
                  type="radio"
                  name="consent-method"
                  value={m.value}
                  checked={method === m.value}
                  onChange={() => setMethod(m.value)}
                  className="accent-ocean"
                />
                {m.label}
              </span>
              <span className="mt-1 text-xs text-muted">{m.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-5 flex items-start gap-3 rounded-2xl border border-line bg-cream/60 p-4 text-sm leading-6 text-ink">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4 flex-none accent-ocean" />
        <span>
          The customer has agreed to me taking their measurements and placing this order on their behalf.
        </span>
      </label>

      {error && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <Button type="submit" pending={saving} pendingLabel="Recording…" className="mt-5 w-full">
        Record consent and continue
      </Button>
    </form>
  );
}

function MeasurementForm({ draftId, step }: { draftId: string; step: MeasurementStep }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(step.fields.map((f) => [f.key, step.values?.[f.key]?.toString() ?? ""])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const checked = validateMeasurements(step.fields, values);
    if (!checked.ok) {
      setErrors(checked.errors);
      document.getElementById(`m-${Object.keys(checked.errors)[0]}`)?.focus();
      return;
    }
    setErrors({});
    if (!confirmed) {
      setFormError("Please confirm your measurements are correct.");
      return;
    }
    startSaving(async () => {
      const result = await saveMeasurementsAction({ draftId, values: checked.values, confirmed: true });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      router.push("/order/checkout");
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="space-y-3">
        <Alert tone="info">
          {step.mode === "agent"
            ? "Measure the customer in centimetres, over light clothing, with a soft tape kept snug but not tight."
            : "Camera sizing is coming soon. For now, enter your measurements in centimetres — measure over light clothing with a soft tape, keeping it snug but not tight."}
        </Alert>
        {step.prefilledFrom === "saved" && (
          <Alert tone="info">{step.mode === "agent"
              ? "We've filled in this customer's last saved measurements. Check each one with them before confirming."
              : "We've filled in your last saved measurements. Check each one before confirming."}</Alert>
        )}
      </div>

      <section className="mt-6 rounded-3xl border border-line bg-white/80 p-5 shadow-card backdrop-blur-xl sm:p-7">
        <h2 className="font-display text-2xl text-ink">Body measurements</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {step.fields.map((f) => (
            <TextField
              key={f.key}
              id={`m-${f.key}`}
              label={`${f.label} (${f.unit})`}
              type="number"
              inputMode="decimal"
              step="0.1"
              min={f.min}
              max={f.max}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              error={errors[f.key]}
              hint={`Between ${f.min} and ${f.max} ${f.unit}`}
            />
          ))}
        </div>

        <label className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-cream/60 p-4 text-sm leading-6 text-ink">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 h-4 w-4 flex-none accent-ocean"
          />
          <span>
            {step.mode === "agent"
              ? "I took these measurements myself and confirm they are correct. Our tailor checks them again before cutting."
              : "I confirm these measurements are correct. Our tailor checks them again before cutting and will contact me if anything looks off."}
          </span>
        </label>
      </section>

      <ActionBar backHref="/order/review" backLabel="Back to review">
        {formError && (
          <div className="mb-2 w-full">
            <Alert tone="danger">{formError}</Alert>
          </div>
        )}
        <Button type="submit" pending={saving} pendingLabel="Saving…" className="w-full">
          Confirm measurements
          <ArrowIcon />
        </Button>
      </ActionBar>
    </form>
  );
}
