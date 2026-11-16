import { describe, expect, it } from "vitest";
import { advanceStage } from "./advanceStage";
import type { AnySupabaseClient } from "./types";

function recordingClient(result: { data?: unknown; error?: unknown } = {}) {
  const value = { data: result.data ?? null, error: result.error ?? null };
  let calledWith: { fn: string; args: unknown } | undefined;
  const client = {
    rpc: (fn: string, args: unknown) => {
      calledWith = { fn, args };
      return Promise.resolve(value);
    },
  } as unknown as AnySupabaseClient;
  return { client, getCalledWith: () => calledWith };
}

describe("advanceStage", () => {
  it("calls fn_advance_production_stage with the job and target stage", async () => {
    const { client, getCalledWith } = recordingClient({ data: { id: "j1" } });

    await advanceStage(client, { jobId: "j1", toStage: "cutting" });

    expect(getCalledWith()).toEqual({
      fn: "fn_advance_production_stage",
      args: { p_job_id: "j1", p_to_stage: "cutting", p_reason: null },
    });
  });

  it("passes a reason through when given (e.g. a QC failure)", async () => {
    const { client, getCalledWith } = recordingClient({ data: { id: "j1" } });

    await advanceStage(client, { jobId: "j1", toStage: "stitching", reason: "seam defect" });

    expect(getCalledWith()).toMatchObject({ args: { p_reason: "seam defect" } });
  });

  it("returns the updated job row", async () => {
    const job = { id: "j1", order_id: "o1", assigned_to_id: "u1", stage: "cutting", started_at: "2026-11-12T00:00:00Z", finished_at: null, priority: 0 };
    const { client } = recordingClient({ data: job });

    expect(await advanceStage(client, { jobId: "j1", toStage: "cutting" })).toEqual(job);
  });

  it("throws the DB's own error untouched", async () => {
    const { client } = recordingClient({ error: { message: "Not allowed" } });

    await expect(
      advanceStage(client, { jobId: "j1", toStage: "cutting" }),
    ).rejects.toMatchObject({ message: "Not allowed" });
  });
});
