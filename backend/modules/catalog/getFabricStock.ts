import type { AnySupabaseClient } from "./types";

// FR-FAB-08/09: what's left to order. stock_metres is the roll on hand (it
// drops only at cutting); orders and checkouts in progress hold fabric as
// reservations. fn_fabric_stock returns both for the fabrics the caller can see.

export interface FabricStock {
  stockMetres: number;
  reservedMetres: number;
  availableMetres: number;
}

type Raw = {
  fabric_id: string;
  stock_metres: number | string;
  reserved_metres: number | string;
  available_metres: number | string;
};

// At most 500 ids per call (the database caps it too).
export async function getFabricStock(
  supabase: AnySupabaseClient,
  fabricIds: string[],
): Promise<Map<string, FabricStock>> {
  const ids = [...new Set(fabricIds)].slice(0, 500);
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc("fn_fabric_stock", { p_fabric_ids: ids });
  if (error) throw error;
  return new Map(
    ((data ?? []) as Raw[]).map((r) => [
      r.fabric_id,
      {
        stockMetres: Number(r.stock_metres),
        reservedMetres: Number(r.reserved_metres),
        availableMetres: Number(r.available_metres),
      },
    ]),
  );
}
