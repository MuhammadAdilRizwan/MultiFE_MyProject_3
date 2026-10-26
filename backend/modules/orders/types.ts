import type { SupabaseClient } from "@supabase/supabase-js";

// Hand-declared row shapes, same convention as modules/catalog/types.ts.
export type AnySupabaseClient = SupabaseClient;

export interface OrderDraftRow {
  id: string;
  customer_id: string | null;
  agent_id: string | null;
  fabric_id: string | null;
  template_id: string | null;
  // { "<option_group_key>": "<option_value_key>", ... }
  options: Record<string, string>;
  measurement_profile_id: string | null;
  step: string;
  expires_at: string | null;
}

export interface FabricReservationRow {
  id: string;
  fabric_id: string;
  order_draft_id: string | null;
  order_id: string | null;
  metres: number;
  kind: "soft" | "hard";
  status: "active" | "converted" | "released" | "expired";
  expires_at: string | null;
}
