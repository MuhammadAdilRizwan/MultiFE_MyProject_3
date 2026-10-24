import type { SupabaseClient } from "@supabase/supabase-js";

// Hand-declared row shapes for the couple of tables this module touches.
// Swap for generated Supabase types once `supabase gen types` is wired up.

export type AppRole =
  | "customer"
  | "agent"
  | "tailor"
  | "qc"
  | "dispatch"
  | "supplier_contact"
  | "admin";
export type AccountStatus = "active" | "suspended";

export interface ProfileRow {
  id: string;
  role: AppRole;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: AccountStatus;
}

export interface AgentRow {
  id: string;
  profile_id: string;
  code: string;
  region: string | null;
  status: "active" | "suspended";
}

export interface SupplierContactRow {
  id: string;
  supplier_id: string;
  user_id: string;
}

// Untyped client param: no generated Database schema yet.
export type AnySupabaseClient = SupabaseClient;

// FR-AUTH-03: every role but customer joins by invite from an admin only —
// there is no shop-owner tier in v2.0 that can invite its own staff.
export type InviteParams =
  | { role: "admin"; email: string; fullName?: string }
  | { role: "agent"; email: string; fullName?: string; agentCode?: string; region?: string }
  | { role: "tailor" | "qc" | "dispatch"; email: string; fullName?: string }
  | { role: "supplier_contact"; email: string; fullName?: string; supplierId: string };
