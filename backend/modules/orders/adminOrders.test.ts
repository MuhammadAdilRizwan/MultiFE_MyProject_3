import { describe, expect, it, vi } from "vitest";
import { addOrderNote, adminCancelOrder } from "./adminOrders";
import type { AnySupabaseClient } from "./types";

const client = (data: unknown, error: unknown = null) => {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { supabase: { rpc } as unknown as AnySupabaseClient, rpc };
};

describe("adminCancelOrder", () => {
  it("cancels as admin with the reason", async () => {
    const { supabase, rpc } = client({ status: "cancelled", payment_status: "refund_pending", total: 1 });
    expect(await adminCancelOrder(supabase, { orderId: "o1", reason: "Customer asked" })).toEqual({
      status: "cancelled",
      payment_status: "refund_pending",
    });
    expect(rpc).toHaveBeenCalledWith("fn_transition_order", {
      p_order_id: "o1",
      p_to_status: "cancelled",
      p_actor_role: "admin",
      p_reason: "Customer asked",
    });
  });

  it("passes the database's refusal through", async () => {
    const { supabase } = client(null, new Error("Order MF-1 is already delivered"));
    await expect(adminCancelOrder(supabase, { orderId: "o1", reason: "x" })).rejects.toThrow("already delivered");
  });
});

describe("addOrderNote", () => {
  it("adds a note or a dispute change", async () => {
    const { supabase, rpc } = client({ id: "n1", kind: "dispute_opened" });
    await addOrderNote(supabase, { orderId: "o1", kind: "dispute_opened", body: "Customer says the hem is short" });
    expect(rpc).toHaveBeenCalledWith("fn_admin_add_order_note", {
      p_order_id: "o1",
      p_kind: "dispute_opened",
      p_body: "Customer says the hem is short",
    });
  });
});
