"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { AssignedCustomerRow, VisitWithCustomer } from "@multife/backend/modules/agents/types";
import { CORE_MEASUREMENT_KEYS, STANDARD_MEASUREMENTS } from "@multife/backend/modules/rules/standardMeasurements";
import { bookVisitAction, cancelVisitAction, recordVisitMeasurementsAction } from "@/app/(agent)/agent-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldShell, TextField, inputClasses } from "@/components/ui/text-field";
import { formatPhone } from "@/lib/phone";

const customerName = (name: string | null | undefined) => name?.trim() || "Unnamed customer";

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-PK", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm".
function localInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AgentVisits({
  visits,
  customers,
  preselectedCustomerId,
}: {
  visits: VisitWithCustomer[];
  customers: AssignedCustomerRow[];
  preselectedCustomerId: string | null;
}) {
  const upcoming = visits.filter((v) => v.status === "scheduled");
  const past = visits.filter((v) => v.status !== "scheduled").reverse();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start">
      <BookVisitForm customers={customers} preselectedCustomerId={preselectedCustomerId} />
      <div className="space-y-6">
        <section className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
          <h2 className="font-display text-2xl text-ink">Upcoming</h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No visits booked. Book one with the form.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {upcoming.map((v) => (
                <UpcomingVisit key={v.id} visit={v} />
              ))}
            </ul>
          )}
        </section>

        {past.length > 0 && (
          <section className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
            <h2 className="font-display text-2xl text-ink">Past visits</h2>
            <ul className="mt-4 divide-y divide-line">
              {past.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{customerName(v.customer?.full_name)}</p>
                    <p className="truncate text-muted">{formatWhen(v.scheduled_for)}</p>
                  </div>
                  <span
                    className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      v.status === "completed" ? "bg-success-soft text-success" : "bg-cream text-muted"
                    }`}
                  >
                    {v.status === "completed" ? "Measurements recorded" : "Cancelled"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function BookVisitForm({
  customers,
  preselectedCustomerId,
}: {
  customers: AssignedCustomerRow[];
  preselectedCustomerId: string | null;
}) {
  const router = useRouter();
  const initialCustomer = customers.some((c) => c.customer_id === preselectedCustomerId) ? preselectedCustomerId! : "";
  const [customerId, setCustomerId] = useState(initialCustomer);
  const [when, setWhen] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [minWhen] = useState(() => localInputValue(new Date()));

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBooked(null);
    if (!customerId) return setError("Choose a customer.");
    if (!when) return setError("Choose a date and time.");
    const scheduled = new Date(when);
    if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() < Date.now()) {
      return setError("Choose a date and time in the future");
    }
    startSaving(async () => {
      const result = await bookVisitAction({ customerId, scheduledFor: scheduled.toISOString(), address, notes });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const name = customerName(customers.find((c) => c.customer_id === customerId)?.customer?.full_name);
      setBooked(`Visit booked with ${name} for ${formatWhen(result.data.scheduled_for)}.`);
      setWhen("");
      setAddress("");
      setNotes("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6 lg:sticky lg:top-32">
      <h2 className="font-display text-2xl text-ink">Book a visit</h2>
      {customers.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Add a customer first, from the Customers tab.</p>
      ) : (
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          <FieldShell id="visit-customer" label="Customer">
            <select id="visit-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputClasses}>
              <option value="">Choose a customer</option>
              {customers.map((c) => (
                <option key={c.customer_id} value={c.customer_id}>
                  {customerName(c.customer?.full_name)}
                  {c.customer?.phone ? ` · ${formatPhone(c.customer.phone)}` : ""}
                </option>
              ))}
            </select>
          </FieldShell>
          <TextField id="visit-when" label="Date and time" type="datetime-local" min={minWhen} value={when} onChange={(e) => setWhen(e.target.value)} />
          <TextField
            id="visit-address"
            label="Address"
            maxLength={300}
            placeholder="House, street, area, city"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <TextField id="visit-notes" label="Notes" optional maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />

          {error && <Alert tone="danger">{error}</Alert>}
          {booked && <Alert tone="success">{booked}</Alert>}

          <Button type="submit" pending={saving} pendingLabel="Booking…" className="w-full">
            Book visit
          </Button>
        </form>
      )}
    </section>
  );
}

function UpcomingVisit({ visit }: { visit: VisitWithCustomer }) {
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, startCancelling] = useTransition();

  function cancel() {
    if (!window.confirm("Cancel this visit?")) return;
    setError(null);
    startCancelling(async () => {
      const result = await cancelVisitAction({ visitId: visit.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-ink">{customerName(visit.customer?.full_name)}</p>
          <p className="text-sm font-semibold text-ocean">{formatWhen(visit.scheduled_for)}</p>
          <p className="mt-1 text-sm text-muted">{visit.address}</p>
          {visit.customer?.phone && <p className="text-sm text-muted">{formatPhone(visit.customer.phone)}</p>}
          {visit.notes && <p className="mt-1 text-sm italic text-muted">{visit.notes}</p>}
        </div>
        {!recording && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRecording(true)}
              className="h-9 rounded-full border border-white/30 bg-mf-blue px-4 text-xs font-bold text-white shadow-blue transition-transform hover:-translate-y-px"
            >
              Record measurements
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={cancelling}
              className="h-9 rounded-full border border-line bg-white px-4 text-xs font-bold text-muted hover:text-danger disabled:opacity-60"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {recording && <RecordMeasurementsForm visitId={visit.id} onClose={() => setRecording(false)} />}
    </li>
  );
}

function RecordMeasurementsForm({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startSaving(async () => {
      const result = await recordVisitMeasurementsAction({ visitId, values });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 border-t border-line pt-4">
      <p className="text-sm text-muted">
        In centimetres. The first six are needed for every outfit; add the others you took.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {STANDARD_MEASUREMENTS.map((f) => {
          const core = CORE_MEASUREMENT_KEYS.includes(f.key);
          return (
            <TextField
              key={f.key}
              id={`visit-${visitId}-${f.key}`}
              label={`${f.label} (${f.unit})`}
              optional={!core}
              type="number"
              inputMode="decimal"
              step="0.1"
              min={f.min}
              max={f.max}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              hint={`${f.min}–${f.max} ${f.unit}`}
            />
          );
        })}
      </div>
      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" pending={saving} pendingLabel="Saving…">
          Save measurements
        </Button>
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
          Back
        </Button>
      </div>
    </form>
  );
}
