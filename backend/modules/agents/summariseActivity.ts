// FR-AGT-11: an agent's own activity — orders placed, in production,
// delivered, cancelled — from the orders they placed. Pure.

export interface ActivityOrder {
  status: string;
  total: number;
}

export interface ActivitySummary {
  placed: number;
  inProduction: number;
  delivered: number;
  cancelled: number;
  // Value of orders that weren't cancelled or failed.
  activeValue: number;
}

const IN_PRODUCTION = new Set([
  "fabric_secured", "received_at_hub", "measurements_approved",
  "in_cutting", "in_stitching", "in_qc", "ready_to_ship", "dispatched",
]);

export function summariseActivity(orders: ActivityOrder[]): ActivitySummary {
  const summary: ActivitySummary = { placed: orders.length, inProduction: 0, delivered: 0, cancelled: 0, activeValue: 0 };
  for (const order of orders) {
    if (IN_PRODUCTION.has(order.status)) summary.inProduction += 1;
    if (order.status === "delivered") summary.delivered += 1;
    if (order.status === "cancelled" || order.status === "failed") summary.cancelled += 1;
    else summary.activeValue += order.total;
  }
  summary.activeValue = Math.round(summary.activeValue * 100) / 100;
  return summary;
}
