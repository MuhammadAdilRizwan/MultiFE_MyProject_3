import type { AnySupabaseClient, SupplierRow } from "./types";

export interface CreateSupplierParams {
  name: string;
  slug: string;
  contact?: Record<string, unknown>;
}

export async function createSupplier(
  supabase: AnySupabaseClient,
  params: CreateSupplierParams,
): Promise<SupplierRow> {
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ name: params.name, slug: params.slug, contact: params.contact ?? {} })
    .select("id, name, slug, status, logo_url, brand_color, contact")
    .single();
  if (error) throw error;

  return data as SupplierRow;
}
