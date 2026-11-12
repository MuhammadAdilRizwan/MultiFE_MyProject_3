import { describe, expect, it } from "vitest";
import { OrderNotCancellableError, canCustomerCancel, cancelMyOrder } from "./cancelOrder";
import type { AnySupabaseClient } from "./types";

function fakeClient(order: { id: string; status: string } | null, opts: { lookupError?: unknown; rpcError?: unknown } = {}) {
  const calls: { op: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const op of ["select", "eq"]) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  }
  builder.maybeSingle = () => Promise.resolve({ data: order, error: opts.lookupError ?? null });
  const client = {
    from(table: string) {
      calls.push({ op: "from", args: [table] });
      return builder;
    },
    rpc(fn: string, args: unknown) {
      calls.push({ op: `rpc:${fn}`, args: [args] });
      return Promise.resolve({ data: opts.rpcError ? null : { status: "cancelled" }, error: opts.rpcError ?? null });
    },
  } as unknown as AnySupabaseClient;
  return { client, calls };
}

const params = { customerId: "c1", orderNumber: "MF-2026-000123", reason: "Ordered by mistake" };

describe("canCustomerCancel", () => {
  it("allows every status before cutting", () => {
    for (const s of ["placed", "fabric_secured", "received_at_hub", "measurements_approved"]) expect(canCustomerCancel(s)).toBe(true);
  });

  it("refuses from cutting onwards and on closed orders", () => {
    for (const s of ["in_cutting", "in_stitching", "in_qc", "ready_to_ship", "dispatched", "delivered", "cancelled", "failed"]) {
      expect(canCustomerCancel(s)).toBe(false);
    }
  });
});

describe("cancelMyOrder", () => {
  it("looks the order up as the customer and cancels it through fn_transition_order", async () => {
    const { client, calls } = fakeClient({ id: "o1", status: "placed" });
    expect(await cancelMyOrder(client, params)).toEqual({ status: "cancelled" });
    expect(calls).toContainEqual({ op: "from", args: ["orders"] });
    expect(calls).toContainEqual({ op: "eq", args: ["number", "MF-2026-000123"] });
    expect(calls).toContainEqual({ op: "eq", args: ["customer_id", "c1"] });
    expect(calls).toContainEqual({
      op: "rpc:fn_transition_order",
      args: [{ p_order_id: "o1", p_to_status: "cancelled", p_actor_role: "customer", p_reason: "Ordered by mistake" }],
    });
  });

  it("refuses an order that isn't the customer's", async () => {
    const { client, calls } = fakeClient(null);
    await expect(cancelMyOrder(client, params)).rejects.toEqual(new OrderNotCancellableError("not_found"));
    expect(calls.some((c) => c.op.startsWith("rpc"))).toBe(false);
  });

  it("refuses once cutting has started, without calling the database function", async () => {
    const { client, calls } = fakeClient({ id: "o1", status: "in_cutting" });
    await expect(cancelMyOrder(client, params)).rejects.toMatchObject({ reason: "too_late" });
    expect(calls.some((c) => c.op.startsWith("rpc"))).toBe(false);
  });

  it("passes on the database's refusal", async () => {
    const { client } = fakeClient({ id: "o1", status: "measurements_approved" }, { rpcError: { message: "This order can no longer be cancelled" } });
    await expect(cancelMyOrder(client, params)).rejects.toMatchObject({ message: "This order can no longer be cancelled" });
  });
});
