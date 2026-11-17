import type { AnySupabaseClient } from "./types";

// FR-AGT-13: every agent's customers, orders and order value for the admin,
// computed in SQL by fn_admin_agent_activity (admin only).

export interface AgentActivity {
  agentId: string;
  profileId: string;
  code: string;
  region: string | null;
  status: "active" | "suspended";
  fullName: string | null;
  email: string | null;
  customers: number;
  ordersTotal: number;
  ordersOpen: number;
  ordersDelivered: number;
  ordersCancelled: number;
  orderValue: number;
  visitsDone: number;
  lastOrderAt: string | null;
}

type Raw = {
  agent_id: string;
  profile_id: string;
  code: string;
  region: string | null;
  agent_status: "active" | "suspended";
  full_name: string | null;
  email: string | null;
  customers: number | string;
  orders_total: number | string;
  orders_open: number | string;
  orders_delivered: number | string;
  orders_cancelled: number | string;
  order_value: number | string;
  visits_done: number | string;
  last_order_at: string | null;
};

export async function getAgentActivity(supabase: AnySupabaseClient): Promise<AgentActivity[]> {
  const { data, error } = await supabase.rpc("fn_admin_agent_activity");
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((r) => ({
    agentId: r.agent_id,
    profileId: r.profile_id,
    code: r.code,
    region: r.region,
    status: r.agent_status,
    fullName: r.full_name,
    email: r.email,
    customers: Number(r.customers),
    ordersTotal: Number(r.orders_total),
    ordersOpen: Number(r.orders_open),
    ordersDelivered: Number(r.orders_delivered),
    ordersCancelled: Number(r.orders_cancelled),
    orderValue: Number(r.order_value),
    visitsDone: Number(r.visits_done),
    lastOrderAt: r.last_order_at,
  }));
}
