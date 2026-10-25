import { describe, expect, it, vi } from "vitest";
import { signInWithPassword } from "./signIn";
import { queryBuilder } from "../../tests/support/queryBuilder";
import type { AnySupabaseClient } from "./types";

function clientWith(opts: {
  passwordRejected?: boolean;
  profile?: Record<string, unknown> | null;
  profileError?: boolean;
}) {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const client = {
    auth: {
      signInWithPassword: async () =>
        opts.passwordRejected
          ? { data: { user: null }, error: { message: "Invalid login credentials" } }
          : { data: { user: { id: "u1" } }, error: null },
      signOut,
    },
    from: () =>
      queryBuilder(
        opts.profileError
          ? { error: { message: "connection lost" } }
          : { data: opts.profile ?? null },
      ),
  };
  return { client: client as unknown as AnySupabaseClient, signOut };
}

describe("signInWithPassword", () => {
  it("returns the user id and profile for a correct, active account", async () => {
    const { client } = clientWith({
      profile: { id: "u1", role: "customer", full_name: "Jane", phone: null, email: "jane@x.com", status: "active" },
    });

    const result = await signInWithPassword(client, { email: "jane@x.com", password: "correct" });

    expect(result.userId).toBe("u1");
    expect(result.profile.status).toBe("active");
  });

  it("rejects with invalid_credentials when Supabase rejects the password", async () => {
    const { client } = clientWith({ passwordRejected: true });

    await expect(signInWithPassword(client, { email: "jane@x.com", password: "wrong" })).rejects.toMatchObject({
      code: "invalid_credentials",
    });
  });

  it("rejects with invalid_credentials when the profile row is missing", async () => {
    const { client } = clientWith({ profile: null });

    await expect(signInWithPassword(client, { email: "jane@x.com", password: "correct" })).rejects.toMatchObject({
      code: "invalid_credentials",
    });
  });

  it("signs the session out and rejects with account_suspended for a suspended account", async () => {
    const { client, signOut } = clientWith({
      profile: { id: "u1", role: "customer", full_name: "Jane", phone: null, email: "jane@x.com", status: "suspended" },
    });

    await expect(signInWithPassword(client, { email: "jane@x.com", password: "correct" })).rejects.toMatchObject({
      code: "account_suspended",
    });
    expect(signOut).toHaveBeenCalledOnce();
  });
});
