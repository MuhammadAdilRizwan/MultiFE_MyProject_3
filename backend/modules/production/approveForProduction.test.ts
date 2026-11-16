import { describe, expect, it } from "vitest";
import { approveForProduction } from "./approveForProduction";
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

describe("approveForProduction", () => {
  it("calls fn_approve_for_production with the job and measurement values", async () => {
    const { client, getCalledWith } = recordingClient({ data: { id: "o1" } });

    await approveForProduction(client, { jobId: "j1", values: { chest: 40 } });

    expect(getCalledWith()).toEqual({
      fn: "fn_approve_for_production",
      args: { p_job_id: "j1", p_values: { chest: 40 }, p_reason: null },
    });
  });

  it("passes a reason through when given", async () => {
    const { client, getCalledWith } = recordingClient({ data: { id: "o1" } });

    await approveForProduction(client, { jobId: "j1", values: {}, reason: "corrected waist" });

    expect(getCalledWith()).toMatchObject({ args: { p_reason: "corrected waist" } });
  });

  it("returns the order row", async () => {
    const order = { id: "o1", number: "MF-2026-000001", status: "measurements_approved", production_approved_by_id: "u1", production_approved_at: "2026-11-12T00:00:00Z" };
    const { client } = recordingClient({ data: order });

    expect(await approveForProduction(client, { jobId: "j1", values: {} })).toEqual(order);
  });

  it("throws the DB's own validation error untouched", async () => {
    const { client } = recordingClient({ error: { message: "Invalid measurements: Chest is missing" } });

    await expect(
      approveForProduction(client, { jobId: "j1", values: {} }),
    ).rejects.toMatchObject({ message: "Invalid measurements: Chest is missing" });
  });
});
