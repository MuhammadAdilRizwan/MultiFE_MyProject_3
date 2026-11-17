import { beforeEach, describe, expect, it, vi } from "vitest";

// Thin Server Actions over already-tested backend modules (fulfilment,
// users) — isolates the actions' own logic (Zod validation, actor-role
// checks) by mocking every collaborator, same convention as
// production-actions.test.ts.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/fulfilment/listReadyToShip", () => ({ listReadyToShip: vi.fn() }));
vi.mock("@multife/backend/modules/fulfilment/dispatchOrder", () => ({ dispatchOrder: vi.fn() }));
vi.mock("@multife/backend/modules/fulfilment/confirmDelivery", () => ({ confirmDelivery: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { listReadyToShip } from "@multife/backend/modules/fulfilment/listReadyToShip";
import { dispatchOrder } from "@multife/backend/modules/fulfilment/dispatchOrder";
import { confirmDelivery } from "@multife/backend/modules/fulfilment/confirmDelivery";
import { confirmDeliveryAction, dispatchOrderAction, listReadyToShipAction } from "./fulfilment-actions";

const fakeSupabase = {};
const UUID1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue(fakeSupabase as never);
});

describe("listReadyToShipAction", () => {
  it("fails when nobody is signed in", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);

    const result = await listReadyToShipAction();

    expect(result).toEqual({ ok: false, error: "Sign in as dispatch to view the ready-to-ship queue." });
    expect(listReadyToShip).not.toHaveBeenCalled();
  });

  it("fails when the caller isn't dispatch or admin", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "tailor", status: "active" } as never);

    const result = await listReadyToShipAction();

    expect(result).toEqual({ ok: false, error: "Sign in as dispatch to view the ready-to-ship queue." });
  });

  it("returns the queue for an active dispatch user", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "dispatch", status: "active" } as never);
    vi.mocked(listReadyToShip).mockResolvedValue([{ id: "o1" } as never]);

    const result = await listReadyToShipAction();

    expect(listReadyToShip).toHaveBeenCalledWith(fakeSupabase);
    expect(result).toEqual({ ok: true, data: [{ id: "o1" }] });
  });

  it("also allows an active admin", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "admin", status: "active" } as never);
    vi.mocked(listReadyToShip).mockResolvedValue([]);

    const result = await listReadyToShipAction();

    expect(result).toEqual({ ok: true, data: [] });
  });
});

describe("dispatchOrderAction", () => {
  it("rejects a missing orderId", async () => {
    const result = await dispatchOrderAction({ courier: "TCS", trackingRef: "TCS-1" } as never);

    expect(result.ok).toBe(false);
    expect(dispatchOrder).not.toHaveBeenCalled();
  });

  it("fails when the caller isn't dispatch or admin", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "tailor", status: "active" } as never);

    const result = await dispatchOrderAction({ orderId: UUID1, courier: "TCS", trackingRef: "TCS-1" });

    expect(result).toEqual({ ok: false, error: "Only dispatch can mark an order dispatched." });
    expect(dispatchOrder).not.toHaveBeenCalled();
  });

  it("dispatches the order for an active dispatch user", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "dispatch", status: "active" } as never);
    vi.mocked(dispatchOrder).mockResolvedValue({ id: UUID1, number: "MF-2026-000001", status: "dispatched" } as never);

    const result = await dispatchOrderAction({ orderId: UUID1, courier: "TCS", trackingRef: "TCS-1" });

    expect(dispatchOrder).toHaveBeenCalledWith(fakeSupabase, { orderId: UUID1, courier: "TCS", trackingRef: "TCS-1" });
    expect(result).toEqual({ ok: true, data: { id: UUID1, number: "MF-2026-000001", status: "dispatched" } });
  });
});

describe("confirmDeliveryAction", () => {
  it("rejects a missing orderId", async () => {
    const result = await confirmDeliveryAction({} as never);

    expect(result.ok).toBe(false);
    expect(confirmDelivery).not.toHaveBeenCalled();
  });

  it("fails when the caller isn't dispatch or admin", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "qc", status: "active" } as never);

    const result = await confirmDeliveryAction({ orderId: UUID1 });

    expect(result).toEqual({ ok: false, error: "Only dispatch can confirm delivery." });
    expect(confirmDelivery).not.toHaveBeenCalled();
  });

  it("confirms delivery for an active dispatch user, passing their role through", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "dispatch", status: "active" } as never);
    vi.mocked(confirmDelivery).mockResolvedValue({ id: UUID1, number: "MF-2026-000001", status: "delivered" } as never);

    const result = await confirmDeliveryAction({ orderId: UUID1, reason: "confirmed by phone" });

    expect(confirmDelivery).toHaveBeenCalledWith(fakeSupabase, {
      orderId: UUID1,
      actorRole: "dispatch",
      reason: "confirmed by phone",
    });
    expect(result).toEqual({ ok: true, data: { id: UUID1, number: "MF-2026-000001", status: "delivered" } });
  });
});
