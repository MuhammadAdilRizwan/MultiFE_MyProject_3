import { describe, expect, it } from "vitest";
import { getCurrentAgent } from "./getCurrentAgent";
import { queryBuilder } from "../../tests/support/queryBuilder";
import type { AnySupabaseClient } from "./types";

function clientWith(opts: { user?: { id: string } | null; agent?: Record<string, unknown> | null; agentError?: boolean }) {
  const client = {
    auth: { getUser: async () => ({ data: { user: opts.user ?? null } }) },
    from: () =>
      queryBuilder(opts.agentError ? { error: { message: "connection lost" } } : { data: opts.agent ?? null }),
  };
  return client as unknown as AnySupabaseClient;
}

describe("getCurrentAgent", () => {
  it("returns null when nobody is signed in", async () => {
    const client = clientWith({ user: null });

    await expect(getCurrentAgent(client)).resolves.toBeNull();
  });

  it("returns the caller's own agents row when signed in as an agent", async () => {
    const client = clientWith({
      user: { id: "u1" },
      agent: { id: "a1", profile_id: "u1", code: "AG-001", region: "Lahore", status: "active" },
    });

    const agent = await getCurrentAgent(client);

    expect(agent?.id).toBe("a1");
  });

  it("returns null when signed in but there's no agents row (not an agent)", async () => {
    const client = clientWith({ user: { id: "u1" }, agent: null });

    await expect(getCurrentAgent(client)).resolves.toBeNull();
  });

  it("throws when the lookup itself errors", async () => {
    const client = clientWith({ user: { id: "u1" }, agentError: true });

    await expect(getCurrentAgent(client)).rejects.toMatchObject({ message: "connection lost" });
  });
});
