import { describe, expect, it } from "vitest";
import { assignProductionJob } from "./assignProductionJob";
import type { AnySupabaseClient } from "./types";
import { queryBuilder } from "../../tests/support/queryBuilder";

function recordingClient(result: { data?: unknown; error?: unknown } = {}) {
  let updatedWith: unknown;
  let filteredId: unknown;
  const builder = queryBuilder(result);
  const originalUpdate = builder.update as (v: unknown) => unknown;
  const originalEq = builder.eq as (c: string, v: unknown) => unknown;
  builder.update = (v: unknown) => {
    updatedWith = v;
    return originalUpdate(v);
  };
  builder.eq = (c: string, v: unknown) => {
    filteredId = v;
    return originalEq(c, v);
  };
  const client = { from: () => builder } as unknown as AnySupabaseClient;
  return { client, getUpdatedWith: () => updatedWith, getFilteredId: () => filteredId };
}

describe("assignProductionJob", () => {
  it("updates assigned_to_id for the given job", async () => {
    const { client, getUpdatedWith, getFilteredId } = recordingClient({
      data: { id: "j1", order_id: "o1", assigned_to_id: "tailor-1", stage: "pending", started_at: null, finished_at: null, priority: 0 },
    });

    await assignProductionJob(client, { jobId: "j1", assignedToId: "tailor-1" });

    expect(getUpdatedWith()).toEqual({ assigned_to_id: "tailor-1" });
    expect(getFilteredId()).toBe("j1");
  });

  it("returns the updated job row", async () => {
    const row = { id: "j1", order_id: "o1", assigned_to_id: "tailor-1", stage: "pending", started_at: null, finished_at: null, priority: 0 };
    const { client } = recordingClient({ data: row });

    expect(await assignProductionJob(client, { jobId: "j1", assignedToId: "tailor-1" })).toEqual(row);
  });

  it("throws the DB's own error (e.g. RLS rejection for a non-admin)", async () => {
    const { client } = recordingClient({ error: { message: "new row violates row-level security policy" } });

    await expect(
      assignProductionJob(client, { jobId: "j1", assignedToId: "tailor-1" }),
    ).rejects.toMatchObject({ message: "new row violates row-level security policy" });
  });
});
