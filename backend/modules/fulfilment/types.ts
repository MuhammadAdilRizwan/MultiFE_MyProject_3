import type { SupabaseClient } from "@supabase/supabase-js";

// Hand-declared row shapes, same convention as modules/catalog/types.ts.
export type AnySupabaseClient = SupabaseClient;

export type ShipmentStatus =
  | "pending"
  | "dispatched"
  | "delivered"
  | "delivery_failed"
  | "ready_for_collection"
  | "completed";

export interface ShipmentRow {
  id: string;
  order_id: string;
  courier: string | null;
  tracking_ref: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  status: ShipmentStatus;
}

export interface ReadyToShipOrderRow {
  id: string;
  number: string;
  status: string;
  est_delivery_date: string | null;
  created_at: string;
}

export interface OrderRow {
  id: string;
  number: string;
  status: string;
}
