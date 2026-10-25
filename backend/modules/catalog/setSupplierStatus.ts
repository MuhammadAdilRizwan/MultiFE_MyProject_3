import type { AnySupabaseClient, SupplierRow } from "./types";

export async function setSupplierStatus(
  supabase: AnySupabaseClient,
  supplierId: string,
  status: SupplierRow["status"],
): Promise<void> {
  const { error } = await supabase.from("suppliers").update({ status }).eq("id", supplierId);
  if (error) throw error;
}
