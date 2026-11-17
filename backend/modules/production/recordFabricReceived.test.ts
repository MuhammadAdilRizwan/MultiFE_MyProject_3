import { describe, expect, it, vi } from "vitest";
import { recordFabricReceived } from "./recordFabricReceived";
import type { AnySupabaseClient } from "./types";

describe("recordFabricReceived", () => {
  it("calls fn_record_fabric_received with the job id and returns the order", async () => {
    const order = { id: "o1", number: "MF-2026-000001", status: "received_at_hub" };
    const rpc = vi.fn().mockResolvedValue({ data: order, error: null });
    expect(await recordFabricReceived({ rpc } as unknown as AnySupabaseClient, "j1")).toEqual(order);
    expect(rpc).toHaveBeenCalledWith("fn_record_fabric_received", { p_job_id: "j1" });
  });

  it("passes the database error through", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("This job is not assigned to you") });
    await expect(recordFabricReceived({ rpc } as unknown as AnySupabaseClient, "j1")).rejects.toThrow("not assigned");
  });
});
