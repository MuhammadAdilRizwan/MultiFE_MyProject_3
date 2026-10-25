import { CatalogError } from "./errors";
import { isFabricPublishable } from "./isFabricPublishable";
import type { AnySupabaseClient, FabricRow } from "./types";

// Hiding a fabric needs no check; making one available does — FR-TPL-10,
// enforced here as the single write path for this flag (used by admin
// review now, and by catalogue-sync later).
export async function setFabricAvailability(
  supabase: AnySupabaseClient,
  fabricId: string,
  isAvailable: boolean,
): Promise<void> {
  if (isAvailable) {
    const { data: fabric, error: fetchError } = await supabase
      .from("fabrics")
      .select("supported_options")
      .eq("id", fabricId)
      .single();
    if (fetchError) throw fetchError;

    if (!isFabricPublishable(fabric as Pick<FabricRow, "supported_options">)) {
      throw new CatalogError(
        "fabric_not_publishable",
        `Fabric ${fabricId} has no supported options and cannot be made available (FR-TPL-10).`,
      );
    }
  }

  const { error } = await supabase.from("fabrics").update({ is_available: isAvailable }).eq("id", fabricId);
  if (error) throw error;
}
