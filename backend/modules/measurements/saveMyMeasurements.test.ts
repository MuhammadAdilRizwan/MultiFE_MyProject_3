import { describe, expect, it } from "vitest";
import { saveMyMeasurements, validateMyMeasurements } from "./saveMyMeasurements";
import type { AnySupabaseClient } from "./types";

const core = { height: 160, shoulder_width: 38, chest: 90, waist: 74, hip: 98, sleeve: 55 };

describe("validateMyMeasurements", () => {
  it("accepts the core set alone and rounds to one decimal", () => {
    const result = validateMyMeasurements({ ...core, chest: "90.04" });
    expect(result).toEqual({ ok: true, values: { ...core, chest: 90 } });
  });

  it("requires every core measurement", () => {
    const result = validateMyMeasurements({ ...core, waist: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(["waist"]);
  });

  it("keeps optional measurements only when filled, and range-checks them", () => {
    expect(validateMyMeasurements({ ...core, neck: "36", thigh: "" })).toEqual({ ok: true, values: { ...core, neck: 36 } });
    const bad = validateMyMeasurements({ ...core, neck: "90" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.neck).toMatch(/between 30 and 45/);
  });

  it("drops keys outside the standard set", () => {
    expect(validateMyMeasurements({ ...core, shoe: "40" })).toEqual({ ok: true, values: core });
  });
});

function fakeClient(opts: { insertError?: unknown; rpcError?: unknown } = {}) {
  const calls: { op: string; args: unknown }[] = [];
  const client = {
    from(table: string) {
      const builder = {
        insert(args: unknown) {
          calls.push({ op: `insert:${table}`, args });
          return builder;
        },
        select() {
          return builder;
        },
        single: () => Promise.resolve({ data: opts.insertError ? null : { id: "p-new" }, error: opts.insertError ?? null }),
      };
      return builder;
    },
    rpc(fn: string, args: unknown) {
      calls.push({ op: `rpc:${fn}`, args });
      return Promise.resolve({ data: { id: "p-new", confirmed_at: "now" }, error: opts.rpcError ?? null });
    },
  } as unknown as AnySupabaseClient;
  return { client, calls };
}

describe("saveMyMeasurements", () => {
  it("creates a new profile and confirms it as the customer", async () => {
    const { client, calls } = fakeClient();
    const result = await saveMyMeasurements(client, { customerId: "c1", values: core });

    expect(result).toEqual({ id: "p-new", confirmed_at: "now" });
    expect(calls).toEqual([
      { op: "insert:measurement_profiles", args: { customer_id: "c1", label: "Me", source: "manual", measurement_values: {} } },
      { op: "rpc:fn_confirm_measurements", args: { p_profile_id: "p-new", p_values: core, p_actor_role: "customer" } },
    ]);
  });

  it("throws when the insert or the confirmation is refused", async () => {
    await expect(saveMyMeasurements(fakeClient({ insertError: { message: "rls" } }).client, { customerId: "c1", values: core })).rejects.toMatchObject({ message: "rls" });
    await expect(saveMyMeasurements(fakeClient({ rpcError: { message: "Not allowed" } }).client, { customerId: "c1", values: core })).rejects.toMatchObject({ message: "Not allowed" });
  });
});
