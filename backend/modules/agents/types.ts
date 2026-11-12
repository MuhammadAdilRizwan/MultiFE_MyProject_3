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
    email: string | null;
    phone: string | null;
    is_provisional: boolean;
  };
}

export interface ConsentRow {
  id: string;
  customer_id: string;
  agent_id: string | null;
  consent_type: "agent_on_behalf" | "camera_use" | "whatsapp_messaging";
  order_id: string | null;
  granted_at: string;
  evidence: Record<string, unknown> | null;
}

export type VisitStatus = "scheduled" | "completed" | "cancelled";

export interface VisitRow {
  id: string;
  customer_id: string;
  agent_id: string;
  scheduled_for: string;
  address: string;
  notes: string | null;
  status: VisitStatus;
  measurement_profile_id: string | null;
  completed_at: string | null;
}

export interface VisitWithCustomer extends VisitRow {
  customer: { full_name: string | null; phone: string | null } | null;
}
