import { describe, expect, it } from "vitest";
import { updatePassword } from "./updatePassword";
import type { AnySupabaseClient } from "./types";

function clientWith(error: { message: string } | null) {
  const client = { auth: { updateUser: async () => ({ error }) } };
  return client as unknown as AnySupabaseClient;
}

describe("updatePassword", () => {
  it("resolves when the session accepts the new password", async () => {
    await expect(updatePassword(clientWith(null), { password: "N3wSecret!" })).resolves.toBeUndefined();
  });

  it("throws when there is no active session (or the password is rejected)", async () => {
    await expect(
      updatePassword(clientWith({ message: "Auth session missing" }), { password: "N3wSecret!" }),
    ).rejects.toMatchObject({ message: "Auth session missing" });
  });
});
