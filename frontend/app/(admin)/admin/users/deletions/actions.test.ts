import { beforeEach, describe, expect, it, vi } from "vitest";

// Deleting or declining a customer's deletion request: validation, the
// active-admin check and how refusals read. The deletion module is mocked.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/users/accountDeletion", () => ({
  completeAccountDeletion: vi.fn(),
  declineAccountDeletion: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { completeAccountDeletion, declineAccountDeletion } from "@multife/backend/modules/users/accountDeletion";
import { completeAccountDeletionAction, declineAccountDeletionAction } from "./actions";

const session = { kind: "session" };
const requestId = "723e4567-e89b-12d3-a456-426614174000";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(session as never);
  vi.mocked(getCurrentProfile).mockResolvedValue({ id: "a1", role: "admin", status: "active" } as never);
  vi.mocked(completeAccountDeletion).mockResolvedValue({ ordersKept: 2 });
  vi.mocked(declineAccountDeletion).mockResolvedValue(undefined);
});

describe("completeAccountDeletionAction", () => {
  it("deletes on the admin's session and refreshes the lists", async () => {
    expect(await completeAccountDeletionAction({ requestId })).toEqual({ ok: true, data: { ordersKept: 2 } });
    expect(completeAccountDeletion).toHaveBeenCalledWith(session, { requestId });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/deletions");
  });

  it("refuses bad input and non-admins", async () => {
    expect(await completeAccountDeletionAction({ requestId: "nope" })).toEqual({ ok: false, error: "Invalid input." });
    vi.mocked(getCurrentProfile).mockResolvedValueOnce({ id: "c1", role: "customer", status: "active" } as never);
    expect((await completeAccountDeletionAction({ requestId })).ok).toBe(false);
    expect(completeAccountDeletion).not.toHaveBeenCalled();
  });

  it("shows the database's own refusal, hides anything else", async () => {
    vi.mocked(completeAccountDeletion).mockRejectedValueOnce({
      message: "Wait until their 2 open order(s) are delivered or cancelled",
    });
    expect(await completeAccountDeletionAction({ requestId })).toEqual({
      ok: false,
      error: "Wait until their 2 open order(s) are delivered or cancelled.",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(completeAccountDeletion).mockRejectedValueOnce({ message: "permission denied for table users" });
    expect(await completeAccountDeletionAction({ requestId })).toEqual({
      ok: false,
      error: "We couldn't delete this account. Nothing was changed. Please try again.",
    });
  });
});

describe("declineAccountDeletionAction", () => {
  it("needs a note the customer will see", async () => {
    expect(await declineAccountDeletionAction({ requestId, note: " x " })).toEqual({ ok: false, error: "Tell the customer why." });
    expect(declineAccountDeletion).not.toHaveBeenCalled();
    expect(await declineAccountDeletionAction({ requestId, note: " Open dispute " })).toEqual({ ok: true, data: null });
    expect(declineAccountDeletion).toHaveBeenCalledWith(session, { requestId, note: "Open dispute" });
  });

  it("shows when the request was already handled", async () => {
    vi.mocked(declineAccountDeletion).mockRejectedValueOnce({ message: "This request is no longer open" });
    expect(await declineAccountDeletionAction({ requestId, note: "Open dispute" })).toEqual({
      ok: false,
      error: "This request is no longer open.",
    });
  });
});
