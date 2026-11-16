import { describe, expect, it } from "vitest";
import { listJobQueue } from "./listJobQueue";
import type { AnySupabaseClient } from "./types";

function recordingClient(result: { data?: unknown; error?: unknown } = {}) {
  const value = { data: result.data ?? null, error: result.error ?? null };
  let filteredAssignedToId: unknown;
  const orderCalls: unknown[] = [];
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (_col: string, v: unknown) => {
      filteredAssignedToId = v;
      return builder;
    },
    order: (col: string, opts: unknown) => {
      orderCalls.push({ col, opts });
      return builder;
    },
    then: (onFulfilled: (v: typeof value) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(value).then(onFulfilled, onRejected),
  };
  const client = { from: () => builder } as unknown as AnySupabaseClient;
  return { client, getFilteredAssignedToId: () => filteredAssignedToId, getOrderCalls: () => orderCalls };
}

describe("listJobQueue", () => {
  it("filters by the given assignee, highest priority then oldest first", async () => {
    const { client, getFilteredAssignedToId, getOrderCalls } = recordingClient({ data: [] });

    await listJobQueue(client, "profile-1");

    expect(getFilteredAssignedToId()).toBe("profile-1");
    expect(getOrderCalls()).toEqual([
      { col: "priority", opts: { ascending: false } },
      { col: "created_at", opts: { ascending: true } },
    ]);
  });

  it("returns the assigned jobs", async () => {
    const rows = [
      { id: "j1", order_id: "o1", assigned_to_id: "profile-1", stage: "pending", started_at: null, finished_at: null, priority: 0 },
    ];
    const { client } = recordingClient({ data: rows });

    expect(await listJobQueue(client, "profile-1")).toEqual(rows);
  });

  it("returns an empty array when there are no jobs", async () => {
    const { client } = recordingClient({ data: null });

    expect(await listJobQueue(client, "profile-1")).toEqual([]);
  });

  it("throws when the read errors", async () => {
    const { client } = recordingClient({ error: { message: "connection lost" } });

    await expect(listJobQueue(client, "profile-1")).rejects.toMatchObject({ message: "connection lost" });
  });
});
