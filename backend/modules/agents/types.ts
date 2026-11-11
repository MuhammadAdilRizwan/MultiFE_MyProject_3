import type { SupabaseClient } from "@supabase/supabase-js";

// Hand-declared row shapes, same convention as modules/catalog/types.ts.
export type AnySupabaseClient = SupabaseClient;

export interface AgentRow {
  id: string;
  profile_id: string;
  code: string;
  region: string | null;
  status: "active" | "suspended";
}

export interface AssignedCustomerRow {
  id: string;
  customer_id: string;
  acquired_at: string;
  source: string | null;
  customer: {
    full_name: string | null;
    phone: string | null;
    is_provisional: boolean;
  };
}
