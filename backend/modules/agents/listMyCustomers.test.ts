import { describe, expect, it } from "vitest";
import { listMyCustomers } from "./listMyCustomers";
import type { AnySupabaseClient } from "./types";

function recordingClient(result: { data?: unknown; error?: unknown } = {}) {
  const value = { data: result.data ?? null, error: result.error ?? null };
  let filteredAgentId: unknown;
  let orderedBy: unknown;
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (_col: string, v: unknown) => {
      filteredAgentId = v;
      return builder;
    },
    order: (col: string, opts: unknown) => {
      orderedBy = { col, opts };
      return Promise.resolve(value);
    },
  };
  const client = { from: () => builder } as unknown as AnySupabaseClient;
  return { client, getFilteredAgentId: () => filteredAgentId, getOrderedBy: () => orderedBy };
}

describe("listMyCustomers", () => {
  it("filters by the given agent id, newest-acquired first", async () => {
    const { client, getFilteredAgentId, getOrderedBy } = recordingClient({ data: [] });

    await listMyCustomers(client, "agent-1");

    expect(getFilteredAgentId()).toBe("agent-1");
    expect(getOrderedBy()).toEqual({ col: "acquired_at", opts: { ascending: false } });
  });

  it("returns the assigned customers with their profile joined", async () => {
    const rows = [
      {
        id: "ac1",
        customer_id: "c1",
        acquired_at: "2026-10-20T00:00:00Z",
        source: "agent_created",
        customer: { full_name: "Sana Khan", phone: "+923001234567", is_provisional: true },
      },
    ];
    const { client } = recordingClient({ data: rows });

    const result = await listMyCustomers(client, "agent-1");

    expect(result).toEqual(rows);
  });

  it("returns an empty array when there are no assignments", async () => {
    const { client } = recordingClient({ data: null });

    expect(await listMyCustomers(client, "agent-1")).toEqual([]);
  });

  it("throws when the read errors", async () => {
    const { client } = recordingClient({ error: { message: "connection lost" } });

    await expect(listMyCustomers(client, "agent-1")).rejects.toMatchObject({ message: "connection lost" });
  });
});
