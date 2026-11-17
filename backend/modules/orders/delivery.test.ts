import { describe, expect, it, vi } from "vitest";
import { dispatchOrder, markDelivered, reattemptDelivery, recordDeliveryFailure } from "./delivery";
import type { AnySupabaseClient } from "./types";

const client = (data: unknown, error: unknown = null) => {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { supabase: { rpc } as unknown as AnySupabaseClient, rpc };
};

describe("delivery", () => {
  it("dispatches with courier and tracking", async () => {
    const { supabase, rpc } = client({ status: "dispatched" });
    expect(await dispatchOrder(supabase, { orderId: "o1", courier: "TCS", trackingRef: "T1" })).toEqual({ status: "dispatched" });
    expect(rpc).toHaveBeenCalledWith("fn_dispatch_order", { p_order_id: "o1", p_courier: "TCS", p_tracking_ref: "T1" });
  });

  it("marks delivered", async () => {
    const { supabase, rpc } = client({ status: "delivered" });
    expect(await markDelivered(supabase, "o1")).toEqual({ status: "delivered" });
    expect(rpc).toHaveBeenCalledWith("fn_mark_delivered", { p_order_id: "o1" });
  });

  it("records a failed delivery and a reattempt", async () => {
    const { supabase, rpc } = client({ id: "s1", status: "delivery_failed" });
    await recordDeliveryFailure(supabase, { orderId: "o1", reason: "Nobody home" });
    expect(rpc).toHaveBeenCalledWith("fn_record_delivery_failure", { p_order_id: "o1", p_reason: "Nobody home" });
    await reattemptDelivery(supabase, { orderId: "o1", courier: "TCS", trackingRef: "T2" });
    expect(rpc).toHaveBeenCalledWith("fn_reattempt_delivery", { p_order_id: "o1", p_courier: "TCS", p_tracking_ref: "T2" });
  });

  it("passes database errors through", async () => {
    const { supabase } = client(null, new Error("This order is not out for delivery"));
    await expect(markDelivered(supabase, "o1")).rejects.toThrow("not out for delivery");
  });
});
