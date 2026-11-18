"use client";

import { useState, useTransition } from "react";
import { assignJobAction, createRemakeAction, markFabricSecuredAction } from "@/app/(admin)/admin/orders/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField, inputClasses } from "@/components/ui/text-field";
import type { OrderProduction } from "@/lib/admin-production";
import { formatMetres } from "@/lib/catalog";
import { ROLE_LABELS, stageLabel, type ProductionRole } from "@/lib/production-stage";

type Staff = { id: string; name: string; role: ProductionRole };

const SHIPMENT_LABELS: Record<string, string> = {
  pending: "Not sent yet",
  dispatched: "Out for delivery",
  delivered: "Delivered",
  delivery_failed: "Delivery failed — waiting to be sent again",
  ready_for_collection: "Ready for collection",
  completed: "Collected",
};

// Admin card on an order: confirm the fabric is secured, choose the tailor /
// QC who makes it (FR-PRD-05), order a remake when QC fails it for good
// (FR-PRD-06/07), and see the delivery (FR-FUL). The workshop part is hidden
// once the order has closed.
export function OrderProductionCard({
  orderNumber,
  production,
  staff,
}: {
  orderNumber: string;
  production: OrderProduction;
  staff: Staff[];
}) {
  const { orderId, status, job, remakeNeeded, remakes, shipment, correction, fulfilmentMethod } = production;
  const [staffId, setStaffId] = useState(remakeNeeded ? "" : (job?.assignedToId ?? ""));
  const [metres, setMetres] = useState(production.yardageMetres?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const closed = ["cancelled", "failed", "delivered"].includes(status);
  const metresLost = remakes.reduce((sum, r) => sum + r.metresLost, 0);
  if (closed && !shipment && remakes.length === 0) return null;

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, message: string) {
    setError(null);
    setDone(null);
    start(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      else setDone(message);
    });
  }

  const staffName = staff.find((s) => s.id === staffId)?.name ?? "the selected staff member";

  return (
    <section aria-labelledby="production-heading" className="rounded-3xl border border-cyan-bright/40 bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="production-heading" className="font-display text-2xl text-ink">
            Production &amp; delivery
          </h2>
          <p className="mt-1 text-sm text-muted">
            {job ? (
              <>
                Workshop stage: <span className="font-semibold text-ink">{stageLabel(job.stage)}</span>
                {!remakeNeeded && (
                  <>
                    {" · "}
                    {job.assignedName ? (
                      <>
                        Assigned to <span className="font-semibold text-ink">{job.assignedName}</span>
                        {job.assignedRole && ` (${ROLE_LABELS[job.assignedRole as ProductionRole] ?? job.assignedRole})`}
                      </>
                    ) : (
                      <span className="font-semibold text-warning">Not assigned yet</span>
                    )}
                  </>
                )}
              </>
            ) : (
              "This order has no production job."
            )}
          </p>
        </div>
        {status === "placed" && (
          <Button
            type="button"
            variant="secondary"
            pending={pending}
            pendingLabel="Saving…"
            onClick={() => run(() => markFabricSecuredAction({ orderId, orderNumber }), "Fabric marked as secured. The assigned tailor can now receive it.")}
            className="h-10 px-4 text-sm"
          >
            Mark fabric secured
          </Button>
        )}
      </div>

      {status === "placed" && (
        <p className="mt-3 text-xs leading-5 text-muted">
          Store ordering isn&apos;t connected yet: once you&apos;ve confirmed the fabric with the store, mark it secured so
          the workshop can receive it.
        </p>
      )}

      {fulfilmentMethod === "collection" && (
        <p className="mt-3 text-sm font-semibold text-ocean">The customer collects this order from the workshop.</p>
      )}

      {correction && (
        <div className="mt-3">
          <Alert tone={correction.status === "declined" ? "danger" : correction.status === "pending" ? "warning" : "success"}>
            {correction.status === "pending"
              ? "Measurement changes sent to the customer — waiting for them to accept before cutting."
              : correction.status === "declined"
                ? `The customer declined the tailor's measurement changes${correction.responseNote ? `: “${correction.responseNote}”` : ""}. Contact them to agree the measurements.`
                : "The customer accepted the tailor's measurement changes."}
            <span className="mt-1 block text-xs">Tailor&apos;s note: “{correction.reason}”</span>
          </Alert>
        </div>
      )}

      {shipment && (
        <dl className="mt-4 grid gap-2 rounded-2xl bg-cream/70 p-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Delivery</dt>
            <dd className="font-semibold text-ink">{SHIPMENT_LABELS[shipment.status] ?? shipment.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Courier</dt>
            <dd className="font-semibold text-ink">{shipment.courier ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Tracking</dt>
            <dd className="break-all font-semibold text-ink">{shipment.trackingRef ?? "—"}</dd>
          </div>
          {shipment.attempts > 0 && (
            <p className="text-xs text-warning sm:col-span-3">
              {shipment.attempts} failed {shipment.attempts === 1 ? "attempt" : "attempts"}
              {shipment.lastFailureReason && ` — last: “${shipment.lastFailureReason}”`}
            </p>
          )}
        </dl>
      )}

      {remakes.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-muted">
          Remade {remakes.length === 1 ? "once" : `${remakes.length} times`} · {formatMetres(metresLost)} of fabric lost (
          {remakes.map((r) => `“${r.reason}”`).join(", ")})
        </p>
      )}

      {!closed && remakeNeeded && job && (
        <div className="mt-4 rounded-2xl border border-danger/25 bg-danger-soft/50 p-4">
          <p className="text-sm font-bold text-danger">Failed quality check — remake needed</p>
          {remakeNeeded.reason && <p className="mt-1 text-sm text-ink">“{remakeNeeded.reason}”</p>}
          <p className="mt-1 text-xs leading-5 text-muted">
            A remake opens an urgent job (by default for the tailor who made it) and sends the order back to cutting. Record how much
            fabric was spoilt, so the loss is visible.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <TextField
              id="remake-metres"
              label="Fabric lost (m)"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={100}
              value={metres}
              onChange={(e) => setMetres(e.target.value)}
            />
            <StaffSelect id="remake-staff" label="Remake by" staff={staff} value={staffId} onChange={setStaffId} automatic />
            <Button
              type="button"
              pending={pending}
              pendingLabel="Ordering…"
              disabled={metres.trim() === "" || Number.isNaN(Number(metres))}
              onClick={() =>
                run(
                  () => createRemakeAction({ jobId: job.id, staffId, metresLost: Number(metres), orderNumber }),
                  staffId ? `Remake ordered and assigned to ${staffName}.` : "Remake ordered and given to the tailor automatically.",
                )
              }
              className="h-11 px-5 text-sm"
            >
              Order remake
            </Button>
          </div>
        </div>
      )}

      {/* Only QC can pass or fail a job, and only the assignee can act on it. */}
      {!closed && !remakeNeeded && job?.stage === "qc" && job.assignedRole !== "qc" && (
        <div className="mt-3">
          <Alert tone="warning">Ready for quality check — reassign this job to a QC member so they can pass or fail it.</Alert>
        </div>
      )}

      {!closed && !remakeNeeded && job && !["passed", "failed"].includes(job.stage) && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <StaffSelect
              id="assign-staff"
              label={job.assignedToId ? "Reassign to" : "Assign to"}
              staff={staff}
              value={staffId}
              onChange={setStaffId}
            />
          </div>
          {staff.length > 0 && (
            <Button
              type="button"
              pending={pending}
              pendingLabel="Assigning…"
              onClick={() => run(() => assignJobAction({ jobId: job.id, staffId, orderNumber }), `Assigned to ${staffName}.`)}
              disabled={!staffId || staffId === job.assignedToId}
              className="h-11 px-5 text-sm"
            >
              Assign
            </Button>
          )}
        </div>
      )}

      {(error || done) && (
        <div className="mt-4">
          <Alert tone={error ? "danger" : "success"}>{error ?? done}</Alert>
        </div>
      )}
    </section>
  );
}

function StaffSelect({
  id,
  label,
  staff,
  value,
  onChange,
  automatic = false,
}: {
  id: string;
  label: string;
  staff: Staff[];
  value: string;
  onChange: (v: string) => void;
  // Offer "Automatic" (empty value) instead of asking for a choice.
  automatic?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {staff.length === 0 ? (
        <p className="mt-1.5 text-sm text-muted">
          No active tailors or QC staff yet. Invite one from <span className="font-semibold">Invite users</span>.
        </p>
      ) : (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClasses} mt-1.5 h-11 text-sm`}>
          <option value="">{automatic ? "Automatic (the tailor who made it)" : "Choose a tailor or QC…"}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {ROLE_LABELS[s.role]}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
