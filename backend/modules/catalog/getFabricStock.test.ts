import { describe, expect, it, vi } from "vitest";
import { getFabricStock } from "./getFabricStock";
import type { AnySupabaseClient } from "./types";

const client = (result: { data: unknown; error: unknown }) => {
  const rpc = vi.fn().mockResolvedValue(result);
  return { supabase: { rpc } as unknown as AnySupabaseClient, rpc };
};

describe("getFabricStock", () => {
  it("returns stock, reserved and available per fabric as numbers", async () => {
    const { supabase, rpc } = client({
      data: [{ fabric_id: "f1", stock_metres: "40.00", reserved_metres: "6.500", available_metres: "33.500" }],
      error: null,
    });

    const stock = await getFabricStock(supabase, ["f1", "f1", "f2"]);

    expect(rpc).toHaveBeenCalledWith("fn_fabric_stock", { p_fabric_ids: ["f1", "f2"] });
    expect(stock.get("f1")).toEqual({ stockMetres: 40, reservedMetres: 6.5, availableMetres: 33.5 });
    expect(stock.has("f2")).toBe(false);
  });

  it("skips the database for an empty list", async () => {
    const { supabase, rpc } = client({ data: [], error: null });
    expect((await getFabricStock(supabase, [])).size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws the database error", async () => {
    const { supabase } = client({ data: null, error: new Error("boom") });
    await expect(getFabricStock(supabase, ["f1"])).rejects.toThrow("boom");
  });
});
