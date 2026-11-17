import { describe, expect, it } from "vitest";
import { confirmDelivery } from "./confirmDelivery";
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

describe("confirmDelivery", () => {
  it("calls fn_transition_order with the order moving to delivered", async () => {
    const { client, getCalledWith } = recordingClient({ data: { id: "o1" } });

    await confirmDelivery(client, { orderId: "o1", actorRole: "dispatch" });

    expect(getCalledWith()).toEqual({
      fn: "fn_transition_order",
      args: { p_order_id: "o1", p_to_status: "delivered", p_actor_role: "dispatch", p_reason: null },
    });
  });

  it("passes a reason through when given", async () => {
    const { client, getCalledWith } = recordingClient({ data: { id: "o1" } });

    await confirmDelivery(client, { orderId: "o1", actorRole: "admin", reason: "confirmed by phone" });

    expect(getCalledWith()).toMatchObject({ args: { p_reason: "confirmed by phone" } });
  });

  it("returns the order row", async () => {
    const order = { id: "o1", number: "MF-2026-000001", status: "delivered" };
    const { client } = recordingClient({ data: order });

    expect(await confirmDelivery(client, { orderId: "o1", actorRole: "dispatch" })).toEqual(order);
  });

  it("throws the DB's own rejection untouched", async () => {
    const { client } = recordingClient({ error: { message: "Not allowed" } });

    await expect(confirmDelivery(client, { orderId: "o1", actorRole: "customer" })).rejects.toMatchObject({
      message: "Not allowed",
    });
  });
});
