import { describe, expect, it } from "vitest";
import { getCurrentProfile } from "./getActor";
import { queryBuilder } from "../../tests/support/queryBuilder";
import type { AnySupabaseClient } from "./types";

function clientWith(opts: {
  user?: { id: string } | null;
  profile?: Record<string, unknown> | null;
  profileError?: boolean;
}) {
  const client = {
    auth: { getUser: async () => ({ data: { user: opts.user ?? null } }) },
    from: () =>
      queryBuilder(
        opts.profileError ? { error: { message: "connection lost" } } : { data: opts.profile ?? null },
      ),
  };
  return client as unknown as AnySupabaseClient;
}

describe("getCurrentProfile", () => {
  it("returns null when nobody is signed in", async () => {
    const client = clientWith({ user: null });

    await expect(getCurrentProfile(client)).resolves.toBeNull();
  });

  it("returns the caller's own profile row when signed in", async () => {
    const client = clientWith({
      user: { id: "u1" },
      profile: { id: "u1", role: "tailor", full_name: "Ali", phone: null, email: "ali@x.com", status: "active" },
    });

    const profile = await getCurrentProfile(client);

    expect(profile?.role).toBe("tailor");
  });

  it("returns null when signed in but the profile row doesn't exist", async () => {
    const client = clientWith({ user: { id: "u1" }, profile: null });

    await expect(getCurrentProfile(client)).resolves.toBeNull();
  });

  it("throws when the profile lookup itself errors", async () => {
    const client = clientWith({ user: { id: "u1" }, profileError: true });

    await expect(getCurrentProfile(client)).rejects.toMatchObject({ message: "connection lost" });
  });
});
