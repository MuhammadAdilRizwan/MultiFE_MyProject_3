import { describe, expect, it, vi } from "vitest";
import { getAgentActivity } from "./agentActivity";
import type { AnySupabaseClient } from "./types";

describe("getAgentActivity", () => {
  it("turns the database's counts and sums into numbers", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          agent_id: "a1", profile_id: "p1", code: "AG-001", region: "Lahore", agent_status: "active",
          full_name: "Ali", email: "ali@x.pk", customers: "4", orders_total: "3", orders_open: "1",
          orders_delivered: "1", orders_cancelled: "1", order_value: "24500.00", visits_done: "2", last_order_at: null,
        },
      ],
      error: null,
    });
    const [row] = await getAgentActivity({ rpc } as unknown as AnySupabaseClient);
    expect(rpc).toHaveBeenCalledWith("fn_admin_agent_activity");
    expect(row).toMatchObject({ code: "AG-001", customers: 4, ordersTotal: 3, orderValue: 24500, visitsDone: 2, status: "active" });
  });

  it("throws the database error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("Not allowed") });
    await expect(getAgentActivity({ rpc } as unknown as AnySupabaseClient)).rejects.toThrow("Not allowed");
  });
});
