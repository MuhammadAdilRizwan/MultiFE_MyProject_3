"use client";

import { useState, useTransition, type FormEvent } from "react";
import { validateMyMeasurements } from "@multife/backend/modules/measurements/saveMyMeasurements";
import { CORE_MEASUREMENT_KEYS, STANDARD_MEASUREMENTS } from "@multife/backend/modules/rules/standardMeasurements";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { formatOrderDate } from "@/lib/order-status";
import { saveMyMeasurementsAction, type SavedMeasurements } from "./actions";

const CORE = STANDARD_MEASUREMENTS.filter((f) => CORE_MEASUREMENT_KEYS.includes(f.key));
const OPTIONAL = STANDARD_MEASUREMENTS.filter((f) => !CORE_MEASUREMENT_KEYS.includes(f.key));

const toInputs = (saved: SavedMeasurements) =>
  Object.fromEntries(STANDARD_MEASUREMENTS.map((f) => [f.key, saved?.values[f.key]?.toString() ?? ""]));

export function MeasurementsEditor({ saved: initial }: { saved: SavedMeasurements }) {
  const [saved, setSaved] = useState(initial);
  const [editing, setEditing] = useState(initial === null);
  const [values, setValues] = useState<Record<string, string>>(() => toInputs(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function startEditing() {
    setValues(toInputs(saved));
    setErrors({});
    setConfirmed(false);
    setFormError(null);
    setNotice(null);
    setEditing(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const checked = validateMyMeasurements(values);
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
      const result = await saveMyMeasurementsAction({ values: checked.values, confirmed: true });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setSaved(result.data);
      setEditing(false);
      setNotice("Your measurements are saved. We'll fill them in on your next order.");
    });
  }

  if (!editing && saved) {
    const shown = STANDARD_MEASUREMENTS.filter((f) => typeof saved.values[f.key] === "number");
    return (
      <div className="space-y-4">
        {notice && <Alert tone="success">{notice}</Alert>}
        <section className="rounded-3xl border border-line bg-white/80 p-5 shadow-card backdrop-blur-xl sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-ink">Saved measurements</h2>
              <p className="mt-1 text-sm text-muted">
                {saved.confirmedBy === "agent" ? "Taken by your MultiFe agent" : "Updated by you"} on{" "}
                {formatOrderDate(saved.confirmedAt)}
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={startEditing}>
              Update
            </Button>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((f) => (
              <div key={f.key} className="rounded-2xl border border-line bg-cream/60 px-4 py-3">
                <dt className="text-xs font-semibold text-muted">{f.label}</dt>
                <dd className="mt-0.5 text-base font-bold text-ink">
                  {saved.values[f.key]} {f.unit}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <p className="text-center text-sm text-muted">
          Orders you&apos;ve already placed keep the measurements they were made with.
        </p>
      </div>
    );
  }

  const field = (f: (typeof STANDARD_MEASUREMENTS)[number], optional: boolean) => (
    <TextField
      key={f.key}
      id={`m-${f.key}`}
      label={`${f.label} (${f.unit})`}
      type="number"
      inputMode="decimal"
      step="0.1"
      min={f.min}
      max={f.max}
      optional={optional}
      value={values[f.key]}
      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
      error={errors[f.key]}
      hint={`Between ${f.min} and ${f.max} ${f.unit}`}
    />
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Alert tone="info">
        Enter your measurements in centimetres. Measure over light clothing with a soft tape, keeping it snug but not
        tight.
      </Alert>

      <section className="rounded-3xl border border-line bg-white/80 p-5 shadow-card backdrop-blur-xl sm:p-7">
        <h2 className="font-display text-2xl text-ink">Body measurements</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">{CORE.map((f) => field(f, false))}</div>

        <h3 className="mt-8 text-base font-bold text-ink">For specific outfits</h3>
        <p className="mt-1 text-sm text-muted">Optional. Some designs need these; add them now to save time later.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{OPTIONAL.map((f) => field(f, true))}</div>

        <label className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-cream/60 p-4 text-sm leading-6 text-ink">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 h-4 w-4 flex-none accent-ocean"
          />
          <span>I confirm these measurements are correct. I&apos;ll check them again on each order before confirming.</span>
        </label>

        {formError && (
          <div className="mt-4">
            <Alert tone="danger">{formError}</Alert>
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
          {saved && (
            <Button type="button" variant="secondary" onClick={() => setEditing(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
          )}
          <Button type="submit" pending={saving} pendingLabel="Saving…" className="w-full sm:flex-1">
            Save measurements
          </Button>
        </div>
      </section>
    </form>
  );
}
