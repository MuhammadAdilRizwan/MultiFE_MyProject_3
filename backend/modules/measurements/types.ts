import type { SupabaseClient } from "@supabase/supabase-js";

// Hand-declared row shapes, same convention as modules/orders/types.ts.
export type AnySupabaseClient = SupabaseClient;

export interface MeasurementProfileRow {
  id: string;
  customer_id: string;
  label: string;
  measurement_values: Record<string, number>;
  source: "ai" | "manual" | "agent" | "production_corrected";
  confirmed_by_role: string | null;
  confirmed_at: string | null;
}

export const PROFILE_COLUMNS = "id, customer_id, label, measurement_values, source, confirmed_by_role, confirmed_at";
