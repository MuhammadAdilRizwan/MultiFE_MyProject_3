import { describe, expect, it, vi } from "vitest";
import { createRemake } from "./createRemake";
import type { AnySupabaseClient } from "./types";

describe("createRemake", () => {
  it("calls fn_create_remake and returns the replacement job", async () => {
    const job = { id: "j2", order_id: "o1", stage: "approved" };
    const rpc = vi.fn().mockResolvedValue({ data: job, error: null });
    expect(await createRemake({ rpc } as unknown as AnySupabaseClient, { jobId: "j1", metresLost: 3.5, assignTo: "u1" })).toEqual(job);
    expect(rpc).toHaveBeenCalledWith("fn_create_remake", { p_job_id: "j1", p_metres_lost: 3.5, p_assign_to: "u1" });
  });

  it("leaves the choice to the database when no one is picked", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "j2" }, error: null });
    await createRemake({ rpc } as unknown as AnySupabaseClient, { jobId: "j1", metresLost: 2 });
    expect(rpc).toHaveBeenCalledWith("fn_create_remake", { p_job_id: "j1", p_metres_lost: 2, p_assign_to: null });
  });

  it("passes the database error through", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("Only a job that failed QC can be remade") });
    await expect(createRemake({ rpc } as unknown as AnySupabaseClient, { jobId: "j1", metresLost: 0, assignTo: "u1" })).rejects.toThrow("failed QC");
  });
});
