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
