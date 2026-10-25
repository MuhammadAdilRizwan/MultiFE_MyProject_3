import { describe, expect, it } from "vitest";
import { signUpCustomer } from "./signUp";
import type { AnySupabaseClient } from "./types";

function clientWith(
  result: { user: { id: string } | null; session: object | null } | { error: { message: string } },
) {
  const client = {
    auth: {
      signUp: async () =>
        "error" in result
          ? { data: { user: null, session: null }, error: result.error }
          : { data: { user: result.user, session: result.session }, error: null },
    },
  };
  return client as unknown as AnySupabaseClient;
}

describe("signUpCustomer", () => {
  it("reports session=true when Supabase issues a session immediately", async () => {
    const client = clientWith({ user: { id: "u1" }, session: { access_token: "t" } });

    const result = await signUpCustomer(client, {
      email: "new@x.com",
      password: "Sup3rSecret!",
      fullName: "New Customer",
    });

    expect(result).toEqual({ userId: "u1", session: true });
  });

  it("reports session=false when email confirmation is pending", async () => {
    const client = clientWith({ user: { id: "u1" }, session: null });

    const result = await signUpCustomer(client, {
      email: "new@x.com",
      password: "Sup3rSecret!",
      fullName: "New Customer",
    });

    expect(result).toEqual({ userId: "u1", session: false });
  });

  it("propagates the error Supabase returns, e.g. a duplicate email", async () => {
    const client = clientWith({ error: { message: "User already registered" } });

    await expect(
      signUpCustomer(client, { email: "dup@x.com", password: "Sup3rSecret!", fullName: "Dup" }),
    ).rejects.toMatchObject({ message: "User already registered" });
  });
});
