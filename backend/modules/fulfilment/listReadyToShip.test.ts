import { describe, expect, it } from "vitest";
import { listReadyToShip } from "./listReadyToShip";
import type { AnySupabaseClient } from "./types";

function recordingClient(result: { data?: unknown; error?: unknown } = {}) {
  const value = { data: result.data ?? null, error: result.error ?? null };
  let filteredStatus: unknown;
  let orderedBy: unknown;
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (_col: string, v: unknown) => {
      filteredStatus = v;
      return builder;
    },
    order: (col: string, opts: unknown) => {
      orderedBy = { col, opts };
      return Promise.resolve(value);
    },
  };
  const client = { from: () => builder } as unknown as AnySupabaseClient;
  return { client, getFilteredStatus: () => filteredStatus, getOrderedBy: () => orderedBy };
}

describe("listReadyToShip", () => {
  it("filters to ready_to_ship, oldest first", async () => {
    const { client, getFilteredStatus, getOrderedBy } = recordingClient({ data: [] });

    await listReadyToShip(client);

    expect(getFilteredStatus()).toBe("ready_to_ship");
    expect(getOrderedBy()).toEqual({ col: "created_at", opts: { ascending: true } });
  });

  it("returns the ready-to-ship orders", async () => {
    const rows = [{ id: "o1", number: "MF-2026-000001", status: "ready_to_ship", est_delivery_date: "2026-12-01", created_at: "2026-11-17T00:00:00Z" }];
    const { client } = recordingClient({ data: rows });

    expect(await listReadyToShip(client)).toEqual(rows);
  });

  it("returns an empty array when there's nothing to ship", async () => {
    const { client } = recordingClient({ data: null });

    expect(await listReadyToShip(client)).toEqual([]);
  });

  it("throws when the read errors", async () => {
    const { client } = recordingClient({ error: { message: "connection lost" } });

    await expect(listReadyToShip(client)).rejects.toMatchObject({ message: "connection lost" });
  });
});
