import { beforeEach, describe, expect, it, vi } from "vitest";

// The cancel action: validation, who may cancel, and how refusals read.
// cancelMyOrder is mocked; its error class is the real one.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/orders/cancelOrder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@multife/backend/modules/orders/cancelOrder")>()),
  cancelMyOrder: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { OrderNotCancellableError, cancelMyOrder } from "@multife/backend/modules/orders/cancelOrder";
import { cancelMyOrderAction } from "./actions";

const session = { kind: "session" };
const orderNumber = "MF-2026-000123";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(session as never);
  vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "active" } as never);
  vi.mocked(cancelMyOrder).mockResolvedValue({ status: "cancelled" });
});

describe("cancelMyOrderAction", () => {
  it("cancels the customer's own order with the chosen reason", async () => {
    expect(await cancelMyOrderAction({ orderNumber, reason: "Changed my mind" })).toEqual({ ok: true, data: { status: "cancelled" } });
    expect(cancelMyOrder).toHaveBeenCalledWith(session, { customerId: "c1", orderNumber, reason: "Changed my mind" });
  });

  it("adds the customer's note to the reason", async () => {
    await cancelMyOrderAction({ orderNumber, reason: "Other", note: "  Moving abroad  " });
    expect(cancelMyOrder).toHaveBeenCalledWith(session, { customerId: "c1", orderNumber, reason: "Other: Moving abroad" });
  });

  it("validates the order number, the reason, and the note for Other", async () => {
    expect((await cancelMyOrderAction({ orderNumber: "123", reason: "Changed my mind" })).ok).toBe(false);
    expect((await cancelMyOrderAction({ orderNumber, reason: "Because" as never })).ok).toBe(false);
    expect(await cancelMyOrderAction({ orderNumber, reason: "Other" })).toEqual({ ok: false, error: "Tell us briefly why you're cancelling." });
    expect(cancelMyOrder).not.toHaveBeenCalled();
  });

  it("refuses staff and suspended accounts", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "a1", role: "agent", status: "active" } as never);
    expect((await cancelMyOrderAction({ orderNumber, reason: "Changed my mind" })).ok).toBe(false);
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "suspended" } as never);
    expect((await cancelMyOrderAction({ orderNumber, reason: "Changed my mind" })).ok).toBe(false);
    expect(cancelMyOrder).not.toHaveBeenCalled();
  });

  it("explains when it's too late, not found, or already cancelled", async () => {
    vi.mocked(cancelMyOrder).mockRejectedValueOnce(new OrderNotCancellableError("too_late"));
    expect(await cancelMyOrderAction({ orderNumber, reason: "Changed my mind" })).toMatchObject({ ok: false, error: expect.stringMatching(/cutting has started/) });

    vi.mocked(cancelMyOrder).mockRejectedValueOnce(new OrderNotCancellableError("not_found"));
    expect(await cancelMyOrderAction({ orderNumber, reason: "Changed my mind" })).toEqual({ ok: false, error: "We couldn't find this order." });

    // Database refusals arrive as PostgREST error objects, not Error instances.
    vi.mocked(cancelMyOrder).mockRejectedValueOnce({ message: "This order can no longer be cancelled" });
    expect(await cancelMyOrderAction({ orderNumber, reason: "Changed my mind" })).toMatchObject({ error: expect.stringMatching(/cutting has started/) });

    vi.mocked(cancelMyOrder).mockRejectedValueOnce({ message: "Order MF-2026-000123 is already cancelled" });
    expect(await cancelMyOrderAction({ orderNumber, reason: "Changed my mind" })).toEqual({ ok: false, error: "This order is already cancelled." });
  });

  it("hides other database errors", async () => {
    vi.mocked(cancelMyOrder).mockRejectedValueOnce({ message: "deadlock detected" });
    expect(await cancelMyOrderAction({ orderNumber, reason: "Changed my mind" })).toEqual({ ok: false, error: "We couldn't cancel your order. Please try again." });
  });
});
