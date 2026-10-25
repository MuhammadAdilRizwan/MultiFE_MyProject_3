import type { SupabaseClient } from "@supabase/supabase-js";

// Hand-declared row shapes, same convention as modules/users/types.ts — swap
// for generated Supabase types once `supabase gen types` is wired up (WBS 0.1).
export type AnySupabaseClient = SupabaseClient;

export interface SupplierRow {
  id: string;
  name: string;
  slug: string;
  status: "pending" | "active" | "suspended";
  logo_url: string | null;
  brand_color: string | null;
  contact: Record<string, unknown>;
}

export interface OptionGroupRow {
  id: string;
  key: string;
  label: string;
  sort: number;
}

export interface OptionValueRow {
  id: string;
  group_id: string;
  key: string;
  label: string;
  image_url: string | null;
  sort: number;
}

export interface FabricRow {
  id: string;
  supplier_id: string;
  name: string;
  composition: string | null;
  properties: Record<string, unknown>;
  price_per_metre: number;
  stock_metres: number;
  // { "<option_group_key>": ["<option_value_key>", ...], ... } — FR-TPL-07
  supported_options: Record<string, string[]>;
  is_available: boolean;
  is_hidden: boolean;
  display_name: string | null;
}

export interface FabricImageRow {
  id: string;
  url: string;
  sort: number;
}

export interface TemplateRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  base_stitch_price: number;
  lead_days: number;
  // [{ key, label, unit, min, max }, ...] — FR-TPL-05
  required_measurements: Array<{ key: string; label: string; unit: string; min: number; max: number }>;
  // { "<option_group_key>": "<option_value_key>", ... } — FR-TPL-06
  recommended_options: Record<string, string>;
  // { base_metres, coefficients: { "<measurement_key>": number }, wastage_margin } — D9
  yardage_formula: { base_metres: number; coefficients: Record<string, number>; wastage_margin: number };
  is_published: boolean;
}

export interface TemplateOptionRow {
  id: string;
  group_id: string;
  value_id: string;
  price_delta: number;
  extra_lead_days: number;
  is_default: boolean;
  group: { key: string; label: string };
  value: { key: string; label: string; image_url: string | null };
}
