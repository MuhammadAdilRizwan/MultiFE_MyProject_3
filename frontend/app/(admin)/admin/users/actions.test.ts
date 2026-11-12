import { beforeEach, describe, expect, it, vi } from "vitest";

// Suspend / reactivate: validation, the active-admin check, self-protection
// and how refusals read. The users module is mocked.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/users/adminUsers", () => ({ setAccountStatus: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { setAccountStatus } from "@multife/backend/modules/users/adminUsers";
import { setAccountStatusAction } from "./actions";

const session = { kind: "session" };
const adminId = "523e4567-e89b-12d3-a456-426614174000";
const userId = "623e4567-e89b-12d3-a456-426614174000";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(session as never);
  vi.mocked(getCurrentProfile).mockResolvedValue({ id: adminId, role: "admin", status: "active" } as never);
  vi.mocked(setAccountStatus).mockImplementation(async (_s, p) => p.status);
});

describe("setAccountStatusAction", () => {
  it("suspends with a reason, on the admin's own session", async () => {
    expect(await setAccountStatusAction({ userId, status: "suspended", reason: "  Fake orders  " })).toEqual({ ok: true, data: { status: "suspended" } });
    expect(setAccountStatus).toHaveBeenCalledWith(session, { userId, status: "suspended", reason: "Fake orders" });
  });

  it("reactivates without a reason", async () => {
    expect(await setAccountStatusAction({ userId, status: "active" })).toEqual({ ok: true, data: { status: "active" } });
    expect(setAccountStatus).toHaveBeenCalledWith(session, { userId, status: "active", reason: undefined });
  });

  it("needs a reason to suspend and a valid user id", async () => {
    expect(await setAccountStatusAction({ userId, status: "suspended", reason: " " })).toEqual({ ok: false, error: "Give a short reason for suspending." });
    expect((await setAccountStatusAction({ userId: "nope", status: "active" })).ok).toBe(false);
    expect(setAccountStatus).not.toHaveBeenCalled();
  });

  it("refuses non-admins and the admin's own account", async () => {
    expect(await setAccountStatusAction({ userId: adminId, status: "suspended", reason: "test" })).toEqual({
      ok: false,
      error: "You cannot change your own account status.",
    });
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "active" } as never);
    expect((await setAccountStatusAction({ userId, status: "active" })).ok).toBe(false);
    expect(setAccountStatus).not.toHaveBeenCalled();
  });

  it("shows safe database messages and hides the rest", async () => {
    vi.mocked(setAccountStatus).mockRejectedValueOnce({ message: "User not found" });
    expect(await setAccountStatusAction({ userId, status: "active" })).toEqual({ ok: false, error: "User not found." });
    vi.mocked(setAccountStatus).mockRejectedValueOnce({ message: "permission denied for table profiles" });
    expect(await setAccountStatusAction({ userId, status: "active" })).toEqual({ ok: false, error: "We couldn't update this account. Please try again." });
  });
});
