import { describe, expect, it } from "vitest";
import { placeCodOrder, type PlaceCodOrderParams } from "./placeCodOrder";
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

const params: PlaceCodOrderParams = {
  draftId: "d1",
  customerId: "c1",
  pricing: { yardageMetres: 5.2, fabricCost: 6240, stitchCost: 3200, optionsCost: 600, total: 10040 },
  leadDays: 14,
  options: [{ group: "neckline", group_label: "Neckline", value: "keyhole", label: "Keyhole", price_delta: 0 }],
  delivery: { full_name: "A Customer", phone: "03001234567", address_line: "House 1, Street 2", city: "Lahore" },
  idempotencyKey: "7f9c2f4e-0000-4000-8000-000000000000",
};

describe("placeCodOrder", () => {
  it("calls fn_place_cod_order with the server-computed price, snapshot and address", async () => {
    const { client, getCalledWith } = recordingClient({ data: { id: "o1", number: "MF-2026-000001" } });

    await placeCodOrder(client, params);

    expect(getCalledWith()).toEqual({
      fn: "fn_place_cod_order",
      args: {
        p_draft_id: "d1",
        p_customer_id: "c1",
        p_yardage: 5.2,
        p_fabric_cost: 6240,
        p_stitch_cost: 3200,
        p_options_cost: 600,
        p_total: 10040,
        p_lead_days: 14,
        p_options: params.options,
        p_delivery: params.delivery,
        p_idempotency_key: params.idempotencyKey,
      },
    });
  });

  it("returns only the order fields the confirmation needs", async () => {
    const { client } = recordingClient({
      data: { id: "o1", number: "MF-2026-000001", total: 10040, est_delivery_date: "2026-11-25", customer_id: "c1" },
    });

    await expect(placeCodOrder(client, params)).resolves.toEqual({
      id: "o1",
      number: "MF-2026-000001",
      total: 10040,
      est_delivery_date: "2026-11-25",
    });
  });

  it("throws the database's own error (e.g. not enough stock)", async () => {
    const { client } = recordingClient({ error: { message: "Not enough fabric in stock to confirm this order" } });

    await expect(placeCodOrder(client, params)).rejects.toMatchObject({
      message: "Not enough fabric in stock to confirm this order",
    });
  });
});
