// Plain-English names for audit_log actions (FR-ADM-10), for the audit log
// page and an order's history. Isomorphic: no data access.

const LABELS: Record<string, string> = {
  "user.role_change": "Changed a user's role",
  "user.suspend": "Suspended an account",
  "user.reactivate": "Reactivated an account",
  "profile.claim": "Customer claimed their account",
  "order.cancel": "Cancelled an order",
  "order.fail": "Marked an order as failed",
  "order.note": "Added an internal note",
  "order.dispute_open": "Opened a dispute",
  "order.dispute_resolve": "Resolved a dispute",
  "agent.order_placed": "Agent placed an order",
  "agent.consent_recorded": "Agent recorded customer consent",
  "agent.measurements_confirmed": "Agent confirmed measurements",
  "agent.visit_booked": "Agent booked a measurement visit",
  "agent.visit_cancelled": "Agent cancelled a measurement visit",
  "agent.visit_measurements_recorded": "Agent recorded visit measurements",
  "measurements.correction_requested": "Tailor sent measurement changes to the customer",
  "measurements.correction_accepted": "Customer accepted measurement changes",
  "measurements.correction_declined": "Customer declined measurement changes",
  "production.remake": "Ordered a remake",
  "shipment.delivery_failed": "Recorded a failed delivery",
};

export const auditActionLabel = (action: string) =>
  LABELS[action] ?? action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// Filter groups for the audit log page; the prefix matches the action name.
export const AUDIT_AREAS = [
  { key: "all", label: "Everything", prefix: null },
  { key: "users", label: "Users", prefix: "user." },
  { key: "orders", label: "Orders", prefix: "order." },
  { key: "agents", label: "Agents", prefix: "agent." },
  { key: "measurements", label: "Measurements", prefix: "measurements." },
  { key: "production", label: "Production", prefix: "production." },
  { key: "deliveries", label: "Deliveries", prefix: "shipment." },
] as const;

export const auditArea = (key: string | undefined) => AUDIT_AREAS.find((a) => a.key === key) ?? AUDIT_AREAS[0];

// A one-line summary of what changed, from the before/after JSON. Keeps to
// the fields admins act on; anything else is in the details.
export function auditSummary(before: unknown, after: unknown): string | null {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (a.role !== undefined) parts.push(`${b.role ?? "?"} → ${a.role}${a.agent_code ? ` (${a.agent_code})` : ""}`);
  else if (a.status !== undefined && b.status !== undefined) parts.push(`${b.status} → ${a.status}`);
  else if (a.status !== undefined) parts.push(String(a.status));
  if (typeof a.reason === "string" && a.reason) parts.push(`“${a.reason}”`);
  if (typeof a.body === "string" && a.body) parts.push(`“${a.body}”`);
  if (typeof a.note === "string" && a.note) parts.push(`“${a.note}”`);
  if (typeof a.fabric_metres_lost === "number" || typeof a.fabric_metres_lost === "string") {
    parts.push(`${a.fabric_metres_lost} m fabric lost`);
  }
  return parts.length ? parts.join(" · ") : null;
}
