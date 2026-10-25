import type { AnySupabaseClient, FabricRow } from "./types";

export interface ListFabricsParams {
  supplierId?: string;
}

// Read-only: RLS already restricts what the caller sees (public reads
// available+not-hidden fabrics from active suppliers; admin/contact/
// production see more, per their own policies). This just shapes the query.
export async function listFabrics(
  supabase: AnySupabaseClient,
  params?: ListFabricsParams,
): Promise<FabricRow[]> {
  let query = supabase
    .from("fabrics")
    .select(
      "id, supplier_id, name, composition, properties, price_per_metre, stock_metres, supported_options, is_available, is_hidden, display_name",
    );

  if (params?.supplierId) {
    query = query.eq("supplier_id", params.supplierId);
  }

  const { data, error } = await query.order("name");
  if (error) throw error;

  return data as FabricRow[];
}
