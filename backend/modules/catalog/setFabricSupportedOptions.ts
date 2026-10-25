import { CatalogError } from "./errors";
import { isFabricPublishable } from "./isFabricPublishable";
import type { AnySupabaseClient, FabricRow } from "./types";

// Admin verification of a fabric's customizations (agreed model: the store's
// feed pre-ticks, an admin confirms by picking from our own vocabulary). Empty
// groups are dropped so `{ cuff: [] }` and "no cuff" mean the same thing.
// Clearing every option while the fabric is live would break FR-TPL-10, so
// that has to go through setFabricAvailability(false) first.
export async function setFabricSupportedOptions(
  supabase: AnySupabaseClient,
  fabricId: string,
  supportedOptions: FabricRow["supported_options"],
): Promise<void> {
  const cleaned: FabricRow["supported_options"] = {};
  for (const [groupKey, values] of Object.entries(supportedOptions)) {
    const unique = [...new Set(values)];
    if (unique.length > 0) cleaned[groupKey] = unique;
  }

  if (!isFabricPublishable({ supported_options: cleaned })) {
    const { data: fabric, error: fetchError } = await supabase
      .from("fabrics")
      .select("is_available")
      .eq("id", fabricId)
      .single();
    if (fetchError) throw fetchError;

    if ((fabric as Pick<FabricRow, "is_available">).is_available) {
      throw new CatalogError(
        "fabric_not_publishable",
        `Fabric ${fabricId} is available, so it must keep at least one supported option (FR-TPL-10).`,
      );
    }
  }

  const { error } = await supabase.from("fabrics").update({ supported_options: cleaned }).eq("id", fabricId);
  if (error) throw error;
}
