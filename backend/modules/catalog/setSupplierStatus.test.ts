import { describe, expect, it } from "vitest";
import { setSupplierStatus } from "./setSupplierStatus";
import type { AnySupabaseClient } from "./types";

function recordingClient(error: { message: string } | null = null) {
  const calls: { update?: unknown; eq?: [string, unknown] } = {};
  const builder: Record<string, unknown> = {
    update: (v: unknown) => {
      calls.update = v;
      return builder;
    },
    eq: (col: string, val: unknown) => {
      calls.eq = [col, val];
      return Promise.resolve({ error });
    },
  };
  const client = { from: () => builder } as unknown as AnySupabaseClient;
  return { client, calls };
}

describe("setSupplierStatus", () => {
  it("updates the supplier's status by id", async () => {
    const { client, calls } = recordingClient();

    await setSupplierStatus(client, "s1", "active");

    expect(calls.update).toEqual({ status: "active" });
    expect(calls.eq).toEqual(["id", "s1"]);
  });

  it("throws when the update errors", async () => {
    const { client } = recordingClient({ message: "not found" });

    await expect(setSupplierStatus(client, "s1", "suspended")).rejects.toMatchObject({ message: "not found" });
  });
});
