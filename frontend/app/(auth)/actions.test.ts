import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@multife/backend/modules/users/errors";

// These actions are thin orchestration: Zod-validate, call a backend module
// function, map the result/error to an ActionResult. The backend functions
// themselves are unit-tested in backend/modules/users/*.test.ts, so here they
// (and the Supabase client factories) are mocked to isolate actions.ts's own
// logic: validation, the admin-only invite gate, and role dispatch.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/signUp", () => ({ signUpCustomer: vi.fn() }));
vi.mock("@multife/backend/modules/users/signIn", () => ({ signInWithPassword: vi.fn() }));
vi.mock("@multife/backend/modules/users/signOut", () => ({ signOutUser: vi.fn() }));
vi.mock("@multife/backend/modules/users/requestPasswordReset", () => ({ requestPasswordReset: vi.fn() }));
vi.mock("@multife/backend/modules/users/updatePassword", () => ({ updatePassword: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/users/inviteUser", () => ({
  inviteAdmin: vi.fn(),
  inviteAgent: vi.fn(),
  inviteProductionStaff: vi.fn(),
  inviteSupplierContact: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signUpCustomer } from "@multife/backend/modules/users/signUp";
import { signInWithPassword } from "@multife/backend/modules/users/signIn";
import { signOutUser } from "@multife/backend/modules/users/signOut";
import { requestPasswordReset } from "@multife/backend/modules/users/requestPasswordReset";
import { updatePassword } from "@multife/backend/modules/users/updatePassword";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import {
  inviteAdmin,
  inviteAgent,
  inviteProductionStaff,
  inviteSupplierContact,
} from "@multife/backend/modules/users/inviteUser";
import {
  inviteUserAction,
  requestPasswordResetAction,
  signInAction,
  signOutAction,
  signUpAction,
  updatePasswordAction,
} from "./actions";

const fakeSupabase = {};

function activeAdmin() {
  return { id: "actor", role: "admin" as const, full_name: null, phone: null, email: null, status: "active" as const };
}

beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue(fakeSupabase as never);
  vi.mocked(createAdminClient).mockReturnValue(fakeSupabase as never);
});

describe("signUpAction", () => {
  it("rejects an invalid email before calling Supabase", async () => {
    const result = await signUpAction({ email: "not-an-email", password: "Sup3rSecret!", fullName: "A" });

    expect(result.ok).toBe(false);
    expect(signUpCustomer).not.toHaveBeenCalled();
  });

  it("rejects a password under 8 characters", async () => {
    const result = await signUpAction({ email: "a@x.com", password: "short", fullName: "A" });

    expect(result.ok).toBe(false);
    expect(signUpCustomer).not.toHaveBeenCalled();
  });

  it("returns the new user id and confirmation state on success", async () => {
    vi.mocked(signUpCustomer).mockResolvedValue({ userId: "u1", session: true });

    const result = await signUpAction({ email: "a@x.com", password: "Sup3rSecret!", fullName: "A" });

    expect(result).toEqual({ ok: true, data: { userId: "u1", confirmed: true } });
  });

  it("turns a thrown AuthError into a failed result carrying its message", async () => {
    vi.mocked(signUpCustomer).mockRejectedValue(new AuthError("already_exists", "a@x.com is already registered."));

    const result = await signUpAction({ email: "a@x.com", password: "Sup3rSecret!", fullName: "A" });

    expect(result).toEqual({ ok: false, error: "a@x.com is already registered." });
  });
});

describe("signInAction", () => {
  it("rejects an empty password", async () => {
    const result = await signInAction({ email: "a@x.com", password: "" });

    expect(result.ok).toBe(false);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns the user id and role on success", async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({
      userId: "u1",
      profile: { id: "u1", role: "customer", full_name: null, phone: null, email: "a@x.com", status: "active" },
    });

    const result = await signInAction({ email: "a@x.com", password: "correct" });

    expect(result).toEqual({ ok: true, data: { userId: "u1", role: "customer" } });
  });
});

describe("signOutAction", () => {
  it("returns ok on success", async () => {
    vi.mocked(signOutUser).mockResolvedValue(undefined);

    await expect(signOutAction()).resolves.toEqual({ ok: true, data: null });
  });

  it("returns a failure result when sign-out throws", async () => {
    vi.mocked(signOutUser).mockRejectedValue(new Error("network error"));

    await expect(signOutAction()).resolves.toEqual({ ok: false, error: "network error" });
  });
});

describe("requestPasswordResetAction", () => {
  it("rejects a malformed email", async () => {
    const result = await requestPasswordResetAction({ email: "nope" });

    expect(result.ok).toBe(false);
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("returns ok without revealing whether the account exists", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue(undefined);

    await expect(requestPasswordResetAction({ email: "a@x.com" })).resolves.toEqual({ ok: true, data: null });
  });
});

describe("updatePasswordAction", () => {
  it("rejects a password under 8 characters", async () => {
    const result = await updatePasswordAction({ password: "short" });

    expect(result.ok).toBe(false);
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("returns ok on success", async () => {
    vi.mocked(updatePassword).mockResolvedValue(undefined);

    await expect(updatePasswordAction({ password: "N3wSecret!" })).resolves.toEqual({ ok: true, data: null });
  });
});

describe("inviteUserAction", () => {
  it("rejects a supplier_contact invite with no supplierId", async () => {
    const result = await inviteUserAction({ role: "supplier_contact", email: "s@x.com" } as never);

    expect(result.ok).toBe(false);
    expect(inviteSupplierContact).not.toHaveBeenCalled();
  });

  it("rejects when the caller is not an admin", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: "actor",
      role: "tailor",
      full_name: null,
      phone: null,
      email: null,
      status: "active",
    });

    const result = await inviteUserAction({ role: "agent", email: "a@x.com" });

    expect(result).toEqual({ ok: false, error: "Only an admin can send invites." });
    expect(inviteAgent).not.toHaveBeenCalled();
  });

  it("rejects when the caller is a suspended admin", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeAdmin(), status: "suspended" });

    const result = await inviteUserAction({ role: "agent", email: "a@x.com" });

    expect(result.ok).toBe(false);
    expect(inviteAgent).not.toHaveBeenCalled();
  });

  it("dispatches an agent invite to inviteAgent with the actor's own client", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(activeAdmin());
    vi.mocked(inviteAgent).mockResolvedValue({ userId: "u2" });

    const result = await inviteUserAction({ role: "agent", email: "a@x.com", agentCode: "AG-1", region: "North" });

    expect(inviteAgent).toHaveBeenCalledWith(
      fakeSupabase,
      { email: "a@x.com", fullName: undefined, agentCode: "AG-1", region: "North" },
      expect.any(String),
    );
    expect(result).toEqual({ ok: true, data: { userId: "u2" } });
  });

  it("dispatches a supplier_contact invite to inviteSupplierContact", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(activeAdmin());
    vi.mocked(inviteSupplierContact).mockResolvedValue({ userId: "u3" });

    await inviteUserAction({
      role: "supplier_contact",
      email: "s@x.com",
      supplierId: "123e4567-e89b-12d3-a456-426614174000",
    });

    expect(inviteSupplierContact).toHaveBeenCalledWith(
      fakeSupabase,
      { email: "s@x.com", fullName: undefined, supplierId: "123e4567-e89b-12d3-a456-426614174000" },
      expect.any(String),
    );
  });

  it("dispatches a production-role invite (qc) to inviteProductionStaff", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(activeAdmin());
    vi.mocked(inviteProductionStaff).mockResolvedValue({ userId: "u4" });

    await inviteUserAction({ role: "qc", email: "q@x.com" });

    expect(inviteProductionStaff).toHaveBeenCalledWith(
      fakeSupabase,
      "qc",
      { email: "q@x.com", fullName: undefined },
      expect.any(String),
    );
  });

  it("dispatches an admin invite to inviteAdmin", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(activeAdmin());
    vi.mocked(inviteAdmin).mockResolvedValue({ userId: "u5" });

    await inviteUserAction({ role: "admin", email: "m@x.com" });

    expect(inviteAdmin).toHaveBeenCalledWith(fakeSupabase, { email: "m@x.com", fullName: undefined }, expect.any(String));
  });
});
