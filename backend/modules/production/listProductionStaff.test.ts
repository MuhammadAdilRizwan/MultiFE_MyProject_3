import { describe, expect, it } from "vitest";
import { listProductionStaff } from "./listProductionStaff";
import type { AnySupabaseClient } from "./types";

function client(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "order"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return m === "order" ? Promise.resolve(result) : builder;
    };
  }
  return { supabase: { from: (t: string) => (calls.push(["from", t]), builder) } as unknown as AnySupabaseClient, calls };
}

describe("listProductionStaff", () => {
  it("lists active tailors and QC by name", async () => {
    const rows = [{ id: "u1", full_name: "Bilal", email: "b@x.pk", role: "tailor" }];
    const { supabase, calls } = client({ data: rows, error: null });
    expect(await listProductionStaff(supabase)).toEqual(rows);
    expect(calls).toContainEqual(["from", "profiles"]);
    expect(calls).toContainEqual(["in", "role", ["tailor", "qc"]]);
    expect(calls).toContainEqual(["eq", "status", "active"]);
  });

  it("throws the database error", async () => {
    const { supabase } = client({ data: null, error: new Error("boom") });
    await expect(listProductionStaff(supabase)).rejects.toThrow("boom");
  });
});
