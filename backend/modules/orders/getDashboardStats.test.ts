import { describe, expect, it } from "vitest";
import { getDashboardStats } from "./getDashboardStats";
import type { AnySupabaseClient } from "./types";

const client = (result: { data: unknown; error: unknown }) =>
  ({ rpc: (fn: string) => (fn === "fn_admin_dashboard_stats" ? Promise.resolve(result) : Promise.reject(new Error(fn))) }) as unknown as AnySupabaseClient;

describe("getDashboardStats", () => {
  it("turns the database's numeric strings into numbers", async () => {
    const stats = await getDashboardStats(
      client({
        data: {
          orders_today: 2,
          orders_this_week: 5,
          orders_total: 9,
          cod_open_count: 4,
          cod_open_value: "52000.00",
          cod_collected_value: "0",
          by_status: { placed: 3, cancelled: 1 },
          top_brands: [{ name: "Khadi", orders: 3, value: "36000.00" }],
        },
        error: null,
      }),
    );
    expect(stats).toEqual({
      ordersToday: 2,
      ordersThisWeek: 5,
      ordersTotal: 9,
      codOpenCount: 4,
      codOpenValue: 52000,
      codCollectedValue: 0,
      byStatus: { placed: 3, cancelled: 1 },
      topBrands: [{ name: "Khadi", orders: 3, value: 36000 }],
    });
  });

  it("copes with no orders yet", async () => {
    const stats = await getDashboardStats(
      client({ data: { orders_today: 0, orders_this_week: 0, orders_total: 0, cod_open_count: 0, cod_open_value: 0, cod_collected_value: 0, by_status: {}, top_brands: [] }, error: null }),
    );
    expect(stats.byStatus).toEqual({});
    expect(stats.topBrands).toEqual([]);
  });

  it("throws when refused", async () => {
    await expect(getDashboardStats(client({ data: null, error: { message: "Not allowed" } }))).rejects.toMatchObject({ message: "Not allowed" });
  });
});
