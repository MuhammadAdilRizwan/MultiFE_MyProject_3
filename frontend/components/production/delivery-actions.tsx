"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
  dispatchOrderAction,
  markCollectedAction,
  markDeliveredAction,
  markReadyForCollectionAction,
  reattemptDeliveryAction,
  recordDeliveryFailureAction,
} from "@/app/(production)/dispatch-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

// Couriers commonly used in Pakistan, offered as suggestions; any name works.
const COURIERS = ["TCS", "Leopards", "M&P", "Trax", "PostEx", "Call Courier", "BlueEx", "Pakistan Post"];

// The delivery step for one order (FR-FUL-02..05). The database re-checks
// the dispatch role and the shipment's state for every action.
export function DeliveryActions({
  orderId,
  status,
  shipmentStatus,
  courier,
  trackingRef,
  fulfilmentMethod,
}: {
  orderId: string;
  status: string;
  shipmentStatus: string | null;
  courier: string | null;
  trackingRef: string | null;
  fulfilmentMethod: "delivery" | "collection";
}) {
  // FR-FUL-06: picked up at the workshop instead of a courier.
  if (fulfilmentMethod === "collection" && status === "ready_to_ship") {
    return shipmentStatus === "ready_for_collection" ? (
      <Card title="Waiting for pickup" text="The customer has been told it's ready. Hand it over once you've checked their name and order number.">
        <OneStep label="Handed over to customer" run={() => markCollectedAction({ orderId })} />
      </Card>
    ) : (
      <Card title="Get it ready for collection" text="Pack the outfit and keep it at the counter. The customer is emailed that it's ready to collect.">
        <OneStep label="Ready for collection" run={() => markReadyForCollectionAction({ orderId })} />
      </Card>
    );
  }
  if (status === "ready_to_ship") {
    return (
      <Card title="Send it out" text="Pack the outfit, hand it to the courier and enter their tracking number. The customer sees both.">
        <ShipForm orderId={orderId} submit="Mark as dispatched" />
      </Card>
    );
  }
  if (status === "dispatched" && shipmentStatus === "delivery_failed") {
    return (
      <Card title="Send it again" text="The last delivery attempt failed. Arrange a new attempt and enter its tracking number.">
        <ShipForm orderId={orderId} submit="Send again" retry defaultCourier={courier ?? ""} defaultTracking={trackingRef ?? ""} />
      </Card>
    );
  }
  if (status === "dispatched") {
    return (
      <Card title="Out for delivery" text={`With ${courier ?? "the courier"}${trackingRef ? `, tracking ${trackingRef}` : ""}. Confirm once the customer has it.`}>
        <Outcome orderId={orderId} />
      </Card>
    );
  }
  return (
    <div className="rounded-3xl border border-line bg-white/70 px-5 py-4 text-sm leading-6 text-muted">
      {status === "delivered" ? "Delivered. Nothing more to do." : "Nothing for dispatch to do on this order."}
    </div>
  );
}

function Card({ title, text, children }: { title: string; text: string; children: ReactNode }) {
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

function ShipForm({
  orderId,
  submit,
  retry = false,
  defaultCourier = "",
  defaultTracking = "",
}: {
  orderId: string;
  submit: string;
  retry?: boolean;
  defaultCourier?: string;
  defaultTracking?: string;
}) {
  const { error, pending, run } = useAction();
  const [courier, setCourier] = useState(defaultCourier);
  const [tracking, setTracking] = useState(retry ? "" : defaultTracking);
  const [errors, setErrors] = useState<{ courier?: string; tracking?: string }>({});

  function send(event: FormEvent) {
    event.preventDefault();
    const found: typeof errors = {};
    if (courier.trim().length < 2) found.courier = "Enter the courier.";
    if (tracking.trim().length < 3) found.tracking = "Enter the tracking number.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const input = { orderId, courier: courier.trim(), trackingRef: tracking.trim() };
    run(() => (retry ? reattemptDeliveryAction(input) : dispatchOrderAction(input)));
  }

  return (
    <form onSubmit={send} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="ship-courier"
          label="Courier"
          list="ship-couriers"
          autoComplete="off"
          maxLength={80}
          value={courier}
          onChange={(e) => setCourier(e.target.value)}
          error={errors.courier}
        />
        <datalist id="ship-couriers">
          {COURIERS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <TextField
          id="ship-tracking"
          label="Tracking number"
          autoComplete="off"
          maxLength={80}
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          error={errors.tracking}
          hint={retry && defaultTracking ? `Last attempt: ${defaultTracking}` : undefined}
        />
      </div>
      {error && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <Button type="submit" pending={pending} pendingLabel="Saving…" className="mt-5 w-full sm:w-auto">
        {submit}
      </Button>
    </form>
  );
}

function OneStep({ label, run: action }: { label: string; run: () => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const { error, pending, run } = useAction();
  return (
    <>
      {error && (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <Button type="button" pending={pending} pendingLabel="Saving…" onClick={() => run(action)} className="w-full sm:w-auto">
        {label}
      </Button>
    </>
  );
}

function Outcome({ orderId }: { orderId: string }) {
  const { error, pending, run } = useAction();
  const [failing, setFailing] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  function fail(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setReasonError("Say why it couldn't be delivered.");
      return;
    }
    setReasonError(null);
    run(() => recordDeliveryFailureAction({ orderId, reason: reason.trim() }));
  }

  return (
    <>
      {error && (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {failing ? (
        <form onSubmit={fail} noValidate className="space-y-3">
          <TextField
            id="delivery-failure"
            label="Why couldn't it be delivered?"
            placeholder="e.g. Nobody at home; wrong address"
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={reasonError ?? undefined}
          />
          <p className="text-xs text-muted">The customer is told, and the order waits here to be sent again.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" pending={pending} pendingLabel="Saving…">
              Record failed delivery
            </Button>
            <Button type="button" variant="secondary" onClick={() => setFailing(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" pending={pending} pendingLabel="Saving…" onClick={() => run(() => markDeliveredAction({ orderId }))}>
            Delivered
          </Button>
          <Button type="button" variant="secondary" onClick={() => setFailing(true)} disabled={pending}>
            Couldn&apos;t deliver
          </Button>
        </div>
      )}
    </>
  );
}
