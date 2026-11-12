import type { AnySupabaseClient } from "./types";

export interface MyCustomer {
  customerId: string;
  fullName: string | null;
  phone: string | null;
}

// One of the agent's own assigned customers, or null when this customer isn't
// assigned to them. Reads through the agent's RLS-scoped client
// ("agent_customers: agent reads own assignments"), so it can't see anyone
// else's customers even if asked.
export async function getMyCustomer(
  supabase: AnySupabaseClient,
  agentId: string,
  customerId: string,
): Promise<MyCustomer | null> {
  const { data, error } = await supabase
    .from("agent_customers")
    .select("customer_id, customer:profiles(full_name, phone)")
    .eq("agent_id", agentId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as { customer_id: string; customer: { full_name: string | null; phone: string | null } | null };
  return { customerId: row.customer_id, fullName: row.customer?.full_name ?? null, phone: row.customer?.phone ?? null };
}
