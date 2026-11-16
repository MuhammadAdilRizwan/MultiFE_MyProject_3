import type { SupabaseClient } from "@supabase/supabase-js";

// Hand-declared row shapes, same convention as modules/catalog/types.ts.
export type AnySupabaseClient = SupabaseClient;

export type ProductionStage = "pending" | "approved" | "cutting" | "stitching" | "qc" | "passed" | "failed";

export interface ProductionJobRow {
  id: string;
  order_id: string;
  assigned_to_id: string | null;
  stage: ProductionStage;
  started_at: string | null;
  finished_at: string | null;
  priority: number;
}

export interface OrderApprovalRow {
  id: string;
  number: string;
  status: string;
  production_approved_by_id: string | null;
  production_approved_at: string | null;
}
