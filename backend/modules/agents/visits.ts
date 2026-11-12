import type { AnySupabaseClient, VisitRow, VisitWithCustomer } from "./types";

// FR-AGT-12: measurement visits. Every write goes through a SECURITY DEFINER
// function (assignment check + audit entry); reads go through RLS
// ("measurement_visits: agent reads own for assigned customers").

export async function bookVisit(
  supabase: AnySupabaseClient,
  params: { customerId: string; scheduledFor: string; address: string; notes?: string },
): Promise<VisitRow> {
  const { data, error } = await supabase.rpc("fn_agent_book_visit", {
    p_customer_id: params.customerId,
    p_scheduled_for: params.scheduledFor,
    p_address: params.address,
    p_notes: params.notes ?? null,
  });
  if (error) throw error;
  return data as VisitRow;
}

// `values` must already be validated (rules/validateMeasurements).
export async function recordVisitMeasurements(
  supabase: AnySupabaseClient,
  params: { visitId: string; values: Record<string, number> },
): Promise<VisitRow> {
  const { data, error } = await supabase.rpc("fn_agent_record_visit_measurements", {
    p_visit_id: params.visitId,
    p_values: params.values,
  });
  if (error) throw error;
  return data as VisitRow;
}

export async function cancelVisit(supabase: AnySupabaseClient, visitId: string): Promise<VisitRow> {
  const { data, error } = await supabase.rpc("fn_agent_cancel_visit", { p_visit_id: visitId });
  if (error) throw error;
  return data as VisitRow;
}

// The agent's visits, soonest first, with the customer's name and phone.
export async function listMyVisits(supabase: AnySupabaseClient, agentProfileId: string): Promise<VisitWithCustomer[]> {
  const { data, error } = await supabase
    .from("measurement_visits")
    .select(
      "id, customer_id, agent_id, scheduled_for, address, notes, status, measurement_profile_id, completed_at, customer:profiles!measurement_visits_customer_id_fkey(full_name, phone)",
    )
    .eq("agent_id", agentProfileId)
    .order("scheduled_for", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as VisitWithCustomer[];
}
