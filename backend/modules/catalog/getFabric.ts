import type { AnySupabaseClient, FabricImageRow, FabricRow } from "./types";

export async function getFabric(
  supabase: AnySupabaseClient,
  fabricId: string,
): Promise<(FabricRow & { images: FabricImageRow[] }) | null> {
  const { data: fabric, error: fabricError } = await supabase
    .from("fabrics")
    .select(
      "id, supplier_id, name, composition, properties, price_per_metre, stock_metres, supported_options, is_available, is_hidden, display_name",
    )
    .eq("id", fabricId)
    .maybeSingle();
  if (fabricError) throw fabricError;
  if (!fabric) return null;

  const { data: images, error: imagesError } = await supabase
    .from("fabric_images")
    .select("id, url, sort")
    .eq("fabric_id", fabricId)
    .order("sort");
  if (imagesError) throw imagesError;

  return { ...(fabric as FabricRow), images: (images ?? []) as FabricImageRow[] };
}
