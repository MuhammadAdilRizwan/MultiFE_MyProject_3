import type { AnySupabaseClient } from "./types";

// FR-ADM-08: the admin home numbers, computed in SQL by
// fn_admin_dashboard_stats (admin-only; Pakistan days, weeks from Monday).

export interface DashboardStats {
  ordersToday: number;
  ordersThisWeek: number;
  ordersTotal: number;
  codOpenCount: number;
  codOpenValue: number;
  codCollectedValue: number;
  byStatus: Record<string, number>;
  topBrands: { name: string; orders: number; value: number }[];
}

type Raw = {
  orders_today: number;
  orders_this_week: number;
  orders_total: number;
  cod_open_count: number;
  cod_open_value: number | string;
  cod_collected_value: number | string;
  by_status: Record<string, number>;
  top_brands: { name: string; orders: number; value: number | string }[];
};

export async function getDashboardStats(supabase: AnySupabaseClient): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc("fn_admin_dashboard_stats");
  if (error) throw error;
  const raw = data as Raw;
  return {
    ordersToday: Number(raw.orders_today),
    ordersThisWeek: Number(raw.orders_this_week),
    ordersTotal: Number(raw.orders_total),
    codOpenCount: Number(raw.cod_open_count),
    codOpenValue: Number(raw.cod_open_value),
    codCollectedValue: Number(raw.cod_collected_value),
    byStatus: Object.fromEntries(Object.entries(raw.by_status ?? {}).map(([k, v]) => [k, Number(v)])),
    topBrands: (raw.top_brands ?? []).map((b) => ({ name: b.name, orders: Number(b.orders), value: Number(b.value) })),
  };
}
