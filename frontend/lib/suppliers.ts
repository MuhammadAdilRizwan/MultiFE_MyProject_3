import { createClient } from "@/lib/supabase/server";

export type ActiveBrand = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  brandColor: string | null;
};

// Public brands available to order from. The explicit status filter matters:
// RLS alone lets admins read every supplier and supplier contacts read their own
// even while pending, so without it they'd see non-live brands on the storefront.
export async function listActiveBrands(): Promise<ActiveBrand[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, slug, logo_url, brand_color")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    console.error("listActiveBrands failed:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url,
    brandColor: row.brand_color,
  }));
}

// One live brand for its storefront, or null when the slug doesn't exist or the
// brand isn't active (same explicit status filter as listActiveBrands).
export async function getActiveBrandBySlug(slug: string): Promise<ActiveBrand | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, slug, logo_url, brand_color")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("getActiveBrandBySlug failed:", error.message);
    return null;
  }
  if (!data) return null;

  return { id: data.id, name: data.name, slug: data.slug, logoUrl: data.logo_url, brandColor: data.brand_color };
}

export type StorefrontBrand = ActiveBrand & { fabricNames: string[] };

// Landing-page cards: each live brand with the names of the fabrics a
// customer can order from it. Filters availability explicitly for the same
// reason as above — an admin's session would otherwise see hidden fabrics.
export async function listStorefrontBrands(): Promise<StorefrontBrand[]> {
  const brands = await listActiveBrands();
  if (brands.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fabrics")
    .select("supplier_id, name, display_name")
    .in("supplier_id", brands.map((b) => b.id))
    .eq("is_available", true)
    .eq("is_hidden", false)
    .order("name", { ascending: true });

  if (error) console.error("listStorefrontBrands fabrics failed:", error.message);

  return brands.map((brand) => ({
    ...brand,
    fabricNames: (data ?? [])
      .filter((f) => f.supplier_id === brand.id)
      .map((f) => (f.display_name as string | null) || (f.name as string)),
  }));
}
