import type { AnySupabaseClient, AssignedCustomerRow } from "./types";

// Reads through the user's own RLS-scoped client — relies on
// "agent_customers: agent reads own assignments" (agent_id = current_agent_id())
// to limit this to the caller's own assignments.
export async function listMyCustomers(
  supabase: AnySupabaseClient,
  agentId: string,
): Promise<AssignedCustomerRow[]> {
  const { data, error } = await supabase
    .from("agent_customers")
    .select("id, customer_id, acquired_at, source, customer:profiles(full_name, phone, is_provisional)")
    .eq("agent_id", agentId)
    .order("acquired_at", { ascending: false });
  if (error) throw error;

  return (data ?? []) as unknown as AssignedCustomerRow[];
}
