import { describe, expect, it, vi } from "vitest";
import { requestPasswordReset } from "./requestPasswordReset";
import type { AnySupabaseClient } from "./types";

function clientWith(error: { message: string } | null) {
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error });
  return {
    client: { auth: { resetPasswordForEmail } } as unknown as AnySupabaseClient,
    resetPasswordForEmail,
  };
}

describe("requestPasswordReset", () => {
  it("resolves and forwards the email + redirect to Supabase, whether or not the account exists", async () => {
    const { client, resetPasswordForEmail } = clientWith(null);

    await expect(
      requestPasswordReset(client, { email: "maybe@x.com", redirectTo: "https://app/auth/callback" }),
    ).resolves.toBeUndefined();

    expect(resetPasswordForEmail).toHaveBeenCalledWith("maybe@x.com", {
      redirectTo: "https://app/auth/callback",
    });
  });

  it("throws when Supabase itself errors (not when the account is merely missing)", async () => {
    const { client } = clientWith({ message: "rate limited" });

    await expect(
      requestPasswordReset(client, { email: "maybe@x.com", redirectTo: "https://app/auth/callback" }),
    ).rejects.toMatchObject({ message: "rate limited" });
  });
});
