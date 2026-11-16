import { describe, expect, it } from "vitest";
import { dispatchOrder } from "./dispatchOrder";
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

describe("dispatchOrder", () => {
  it("calls fn_dispatch_order with the order, courier and tracking ref", async () => {
    const { client, getCalledWith } = recordingClient({ data: { id: "o1" } });

    await dispatchOrder(client, { orderId: "o1", courier: "TCS", trackingRef: "TCS-123" });

    expect(getCalledWith()).toEqual({
      fn: "fn_dispatch_order",
      args: { p_order_id: "o1", p_courier: "TCS", p_tracking_ref: "TCS-123" },
    });
  });

  it("returns the order row", async () => {
    const order = { id: "o1", number: "MF-2026-000001", status: "dispatched" };
    const { client } = recordingClient({ data: order });

    expect(await dispatchOrder(client, { orderId: "o1", courier: "TCS", trackingRef: "TCS-123" })).toEqual(order);
  });

  it("throws the DB's own rejection untouched", async () => {
    const { client } = recordingClient({ error: { message: "Only dispatch can dispatch an order" } });

    await expect(
      dispatchOrder(client, { orderId: "o1", courier: "TCS", trackingRef: "TCS-123" }),
    ).rejects.toMatchObject({ message: "Only dispatch can dispatch an order" });
  });
});
