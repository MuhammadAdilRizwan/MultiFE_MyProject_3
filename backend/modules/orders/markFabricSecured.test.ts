import { describe, expect, it, vi } from "vitest";
import { markFabricSecured } from "./markFabricSecured";
import type { AnySupabaseClient } from "./types";

describe("markFabricSecured", () => {
  it("moves the order to fabric_secured as admin", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "o1", status: "fabric_secured" }, error: null });
    expect(await markFabricSecured({ rpc } as unknown as AnySupabaseClient, "o1")).toEqual({ status: "fabric_secured" });
    expect(rpc).toHaveBeenCalledWith("fn_transition_order", {
      p_order_id: "o1",
      p_to_status: "fabric_secured",
      p_actor_role: "admin",
    });
  });

  it("passes the database error through", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("Cannot move an order") });
    await expect(markFabricSecured({ rpc } as unknown as AnySupabaseClient, "o1")).rejects.toThrow("Cannot move");
  });
});
