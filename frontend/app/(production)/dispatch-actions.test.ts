import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications", () => ({ kickNotifications: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/orders/collection", () => ({ markReadyForCollection: vi.fn(), markCollected: vi.fn() }));
vi.mock("@multife/backend/modules/orders/delivery", () => ({
  dispatchOrder: vi.fn(),
  markDelivered: vi.fn(),
  recordDeliveryFailure: vi.fn(),
  reattemptDelivery: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { dispatchOrder, markDelivered, reattemptDelivery, recordDeliveryFailure } from "@multife/backend/modules/orders/delivery";
import { markCollected, markReadyForCollection } from "@multife/backend/modules/orders/collection";
import {
  dispatchOrderAction,
  markCollectedAction,
  markDeliveredAction,
  markReadyForCollectionAction,
  reattemptDeliveryAction,
  recordDeliveryFailureAction,
} from "./dispatch-actions";

const supabase = {};
const ORDER = "11111111-1111-4111-8111-111111111111";
const as = (role: string, status = "active") => vi.mocked(getCurrentProfile).mockResolvedValue({ id: "u1", role, status } as never);

beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue(supabase as never);
  vi.mocked(dispatchOrder).mockReset();
});

describe("dispatchOrderAction", () => {
  it("refuses anyone but active dispatch staff", async () => {
    as("tailor");
    expect((await dispatchOrderAction({ orderId: ORDER, courier: "TCS", trackingRef: "T-1" })).ok).toBe(false);
    as("dispatch", "suspended");
    expect((await dispatchOrderAction({ orderId: ORDER, courier: "TCS", trackingRef: "T-1" })).ok).toBe(false);
    expect(dispatchOrder).not.toHaveBeenCalled();
  });

  it("needs a courier and tracking number", async () => {
    as("dispatch");
    expect(await dispatchOrderAction({ orderId: ORDER, courier: "TCS", trackingRef: " " })).toEqual({ ok: false, error: "Enter the tracking number." });
  });

  it("dispatches with trimmed values", async () => {
    as("dispatch");
    vi.mocked(dispatchOrder).mockResolvedValue({ status: "dispatched" });
    expect(await dispatchOrderAction({ orderId: ORDER, courier: " TCS ", trackingRef: " T-1 " })).toEqual({ ok: true, data: { status: "dispatched" } });
    expect(dispatchOrder).toHaveBeenCalledWith(supabase, { orderId: ORDER, courier: "TCS", trackingRef: "T-1" });
  });
});

describe("delivery outcomes", () => {
  it("marks delivered", async () => {
    as("dispatch");
    vi.mocked(markDelivered).mockResolvedValue({ status: "delivered" });
    expect(await markDeliveredAction({ orderId: ORDER })).toEqual({ ok: true, data: { status: "delivered" } });
  });

  it("needs a reason for a failed delivery", async () => {
    as("dispatch");
    expect((await recordDeliveryFailureAction({ orderId: ORDER, reason: "no" })).ok).toBe(false);
    vi.mocked(recordDeliveryFailure).mockResolvedValue({ status: "delivery_failed" } as never);
    expect(await recordDeliveryFailureAction({ orderId: ORDER, reason: "Nobody at home" })).toEqual({ ok: true, data: { status: "delivery_failed" } });
  });

  it("sends it out again", async () => {
    as("dispatch");
    vi.mocked(reattemptDelivery).mockResolvedValue({ status: "dispatched" } as never);
    expect(await reattemptDeliveryAction({ orderId: ORDER, courier: "Leopards", trackingRef: "L-9" })).toEqual({ ok: true, data: { status: "dispatched" } });
  });
});

describe("collection", () => {
  it("refuses non-dispatch staff", async () => {
    as("qc");
    expect((await markReadyForCollectionAction({ orderId: ORDER })).ok).toBe(false);
    expect(markReadyForCollection).not.toHaveBeenCalled();
  });

  it("marks ready, then handed over", async () => {
    as("dispatch");
    vi.mocked(markReadyForCollection).mockResolvedValue({ status: "ready_for_collection" });
    vi.mocked(markCollected).mockResolvedValue({ status: "delivered" });
    expect(await markReadyForCollectionAction({ orderId: ORDER })).toEqual({ ok: true, data: { status: "ready_for_collection" } });
    expect(await markCollectedAction({ orderId: ORDER })).toEqual({ ok: true, data: { status: "delivered" } });
    expect(markCollected).toHaveBeenCalledWith(supabase, ORDER);
  });
});
