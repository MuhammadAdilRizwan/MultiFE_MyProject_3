import { describe, expect, it, vi } from "vitest";
import { markCollected, markReadyForCollection } from "./collection";
import type { AnySupabaseClient } from "./types";

describe("collection", () => {
  it("marks ready, then collected", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { status: "ready_for_collection" }, error: null }).mockResolvedValueOnce({ data: { status: "delivered" }, error: null });
    const supabase = { rpc } as unknown as AnySupabaseClient;
    expect(await markReadyForCollection(supabase, "o1")).toEqual({ status: "ready_for_collection" });
    expect(await markCollected(supabase, "o1")).toEqual({ status: "delivered" });
    expect(rpc).toHaveBeenNthCalledWith(1, "fn_mark_ready_for_collection", { p_order_id: "o1" });
    expect(rpc).toHaveBeenNthCalledWith(2, "fn_mark_collected", { p_order_id: "o1" });
  });

  it("passes database errors through", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("This order is not waiting to be collected") });
    await expect(markReadyForCollection({ rpc } as unknown as AnySupabaseClient, "o1")).rejects.toThrow("not waiting");
  });
});
