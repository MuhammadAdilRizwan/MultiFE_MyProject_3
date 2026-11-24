import { beforeEach, describe, expect, it, vi } from "vitest";

// Asking to delete the account: who may, the reason rule, and that the
// fresh state comes back. The deletion module is mocked.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/users/accountDeletion", () => ({
  getMyDeletionState: vi.fn(),
  requestAccountDeletion: vi.fn(),
  withdrawAccountDeletion: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { getMyDeletionState, requestAccountDeletion, withdrawAccountDeletion } from "@multife/backend/modules/users/accountDeletion";
import { getMyDeletionStateAction, requestAccountDeletionAction, withdrawAccountDeletionAction } from "./deletion-actions";

const session = { kind: "session" };
const none = { request: null, openOrders: 0 };
const asked = {
  request: { id: "r1", status: "pending" as const, reason: null, requestedAt: "2026-11-24T10:00:00Z", resolvedAt: null, adminNote: null },
  openOrders: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(session as never);
  vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "active" } as never);
  vi.mocked(getMyDeletionState).mockResolvedValue(none);
  vi.mocked(requestAccountDeletion).mockResolvedValue("r1");
  vi.mocked(withdrawAccountDeletion).mockResolvedValue(true);
});

describe("getMyDeletionStateAction", () => {
  it("reads the signed-in customer's own state", async () => {
    expect(await getMyDeletionStateAction()).toEqual({ ok: true, data: none });
    expect(getMyDeletionState).toHaveBeenCalledWith(session, "c1");
  });

  it("refuses staff, guests and suspended accounts", async () => {
    for (const profile of [{ id: "a1", role: "admin", status: "active" }, null, { id: "c1", role: "customer", status: "suspended" }]) {
      vi.mocked(getCurrentProfile).mockResolvedValueOnce(profile as never);
      expect((await getMyDeletionStateAction()).ok).toBe(false);
    }
    expect(getMyDeletionState).not.toHaveBeenCalled();
  });
});

describe("requestAccountDeletionAction", () => {
  it("sends the trimmed reason (or null) and returns the new state", async () => {
    vi.mocked(getMyDeletionState).mockResolvedValue(asked);
    expect(await requestAccountDeletionAction({ reason: "  Moving abroad " })).toEqual({ ok: true, data: asked });
    expect(requestAccountDeletion).toHaveBeenCalledWith(session, { reason: "Moving abroad" });
    await requestAccountDeletionAction({ reason: "   " });
    expect(requestAccountDeletion).toHaveBeenLastCalledWith(session, { reason: null });
  });

  it("rejects a reason over 500 characters", async () => {
    expect(await requestAccountDeletionAction({ reason: "x".repeat(501) })).toEqual({
      ok: false,
      error: "Keep the reason under 500 characters.",
    });
    expect(requestAccountDeletion).not.toHaveBeenCalled();
  });

  it("refuses non-customers and hides database errors", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValueOnce({ id: "t1", role: "tailor", status: "active" } as never);
    expect((await requestAccountDeletionAction({ reason: "" })).ok).toBe(false);
    expect(requestAccountDeletion).not.toHaveBeenCalled();

    vi.mocked(requestAccountDeletion).mockRejectedValueOnce({ message: "duplicate key value violates unique constraint" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await requestAccountDeletionAction({ reason: "" })).toEqual({
      ok: false,
      error: "We couldn't send your request. Please try again.",
    });
  });
});

describe("withdrawAccountDeletionAction", () => {
  it("withdraws and returns the new state", async () => {
    expect(await withdrawAccountDeletionAction()).toEqual({ ok: true, data: none });
    expect(withdrawAccountDeletion).toHaveBeenCalledWith(session);
  });
});
