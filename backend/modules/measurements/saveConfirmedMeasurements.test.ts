import { describe, expect, it } from "vitest";
import { saveConfirmedMeasurements } from "./saveConfirmedMeasurements";
import type { AnySupabaseClient } from "./types";

type Call = { table?: string; fn?: string; op: string; args?: unknown };

interface FakeResults {
  ordersCount?: number;
  insertedId?: string;
  rpcError?: unknown;
}

// Records every from()/rpc() call; each table answers with a fixed result.
function fakeClient(results: FakeResults = {}) {
  const calls: Call[] = [];
  const answer = (table: string) => {
    if (table === "orders") return { count: results.ordersCount ?? 0, data: null, error: null };
    if (table === "measurement_profiles") return { data: { id: results.insertedId ?? "p-new" }, error: null };
    return { data: null, error: null };
  };
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const record = (op: string, args?: unknown) => {
        calls.push({ table, op, args });
        return builder;
      };
      builder.select = (...args: unknown[]) => record("select", args);
      builder.insert = (args: unknown) => record("insert", args);
      builder.update = (args: unknown) => record("update", args);
      builder.eq = (...args: unknown[]) => record("eq", args);
      builder.single = () => Promise.resolve(answer(table));
      builder.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(answer(table)).then(onOk, onErr);
      return builder;
    },
    rpc(fn: string, args: unknown) {
      calls.push({ fn, op: "rpc", args });
      return Promise.resolve({ data: { id: "confirmed" }, error: results.rpcError ?? null });
    },
  } as unknown as AnySupabaseClient;
  return { client, calls };
}

const values = { chest: 96, waist: 80 };
const confirmedWith = (profileId: string) =>
  expect.objectContaining({ fn: "fn_confirm_measurements", args: expect.objectContaining({ p_profile_id: profileId }) });

describe("saveConfirmedMeasurements", () => {
  it("creates a profile, confirms it as the customer, and links it to the draft", async () => {
    const { client, calls } = fakeClient({ insertedId: "p1" });

    const result = await saveConfirmedMeasurements(client, { customerId: "c1", draftId: "d1", values });

    expect(result).toEqual({ id: "confirmed" });
    expect(calls).toContainEqual({
      table: "measurement_profiles",
      op: "insert",
      args: { customer_id: "c1", label: "Me", source: "manual", measurement_values: {} },
    });
    expect(calls).toContainEqual({
      fn: "fn_confirm_measurements",
      op: "rpc",
      args: { p_profile_id: "p1", p_values: values, p_actor_role: "customer" },
    });
    expect(calls).toContainEqual({
      table: "order_drafts",
      op: "update",
      args: { measurement_profile_id: "p1", step: "measurements" },
    });
  });

  it("re-confirms the draft's current profile while no order uses it", async () => {
    const { client, calls } = fakeClient({ ordersCount: 0 });

    await saveConfirmedMeasurements(client, { customerId: "c1", draftId: "d1", values, currentProfileId: "p-old" });

    expect(calls.some((c) => c.table === "measurement_profiles" && c.op === "insert")).toBe(false);
    expect(calls).toContainEqual(confirmedWith("p-old"));
  });

  it("starts a new profile when an order already uses the current one", async () => {
    const { client, calls } = fakeClient({ ordersCount: 1, insertedId: "p2" });

    await saveConfirmedMeasurements(client, { customerId: "c1", draftId: "d1", values, currentProfileId: "p-ordered" });

    expect(calls).toContainEqual(confirmedWith("p2"));
  });

  it("throws the database's error when confirmation is refused", async () => {
    const { client } = fakeClient({ rpcError: { message: "Not allowed" } });

    await expect(saveConfirmedMeasurements(client, { customerId: "c1", draftId: "d1", values })).rejects.toMatchObject({
      message: "Not allowed",
    });
  });
});
