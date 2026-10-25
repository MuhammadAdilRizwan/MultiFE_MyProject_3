import { describe, expect, it } from "vitest";
import { signOutUser } from "./signOut";
import type { AnySupabaseClient } from "./types";

function clientWith(error: { message: string } | null) {
  const client = { auth: { signOut: async () => ({ error }) } };
  return client as unknown as AnySupabaseClient;
}

describe("signOutUser", () => {
  it("resolves when Supabase signs the session out", async () => {
    await expect(signOutUser(clientWith(null))).resolves.toBeUndefined();
  });

  it("throws when Supabase fails to sign out", async () => {
    await expect(signOutUser(clientWith({ message: "network error" }))).rejects.toMatchObject({
      message: "network error",
    });
  });
});
