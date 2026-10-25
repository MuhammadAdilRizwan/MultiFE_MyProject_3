import { describe, expect, it, vi } from "vitest";
import { listFabrics } from "./listFabrics";
import type { AnySupabaseClient } from "./types";

// Records the arguments .eq() was called with, since the only way to verify
// an optional filter was applied is to observe the call the client made.
function recordingFabricsClient(rows: unknown[]) {
  const eqCalls: Array<[string, unknown]> = [];
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => Promise.resolve({ data: rows, error: null }),
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return builder;
    },
  };
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as AnySupabaseClient, eqCalls, from };
}

describe("listFabrics", () => {
  it("returns the fabrics RLS lets the caller see", async () => {
    const { client } = recordingFabricsClient([
      { id: "f1", supplier_id: "s1", name: "Raw silk" },
      { id: "f2", supplier_id: "s1", name: "Khadi cotton" },
    ]);

    const result = await listFabrics(client);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Raw silk");
  });

  it("queries the fabrics table", async () => {
    const { client, from } = recordingFabricsClient([]);

    await listFabrics(client);

    expect(from).toHaveBeenCalledWith("fabrics");
  });

  it("filters by supplierId when given", async () => {
    const { client, eqCalls } = recordingFabricsClient([]);

    await listFabrics(client, { supplierId: "s1" });

    expect(eqCalls).toEqual([["supplier_id", "s1"]]);
  });

  it("does not filter when no supplierId is given", async () => {
    const { client, eqCalls } = recordingFabricsClient([]);

    await listFabrics(client);

    expect(eqCalls).toEqual([]);
  });

  it("throws when the query errors", async () => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => Promise.resolve({ data: null, error: { message: "connection lost" } }),
    };
    const client = { from: () => builder } as unknown as AnySupabaseClient;

    await expect(listFabrics(client)).rejects.toMatchObject({ message: "connection lost" });
  });
});
