// Customer-facing names for orders.status (FR-ORD-02) and where an order is
// on its journey. Isomorphic: no data access.

export type OrderStatus =
  | "placed"
  | "fabric_secured"
  | "received_at_hub"
  | "measurements_approved"
  | "in_cutting"
  | "in_stitching"
  | "in_qc"
  | "ready_to_ship"
  | "dispatched"
  | "delivered"
  | "cancelled"
  | "failed";

const LABELS: Record<OrderStatus, string> = {
  placed: "Order placed",
  fabric_secured: "Fabric secured",
  received_at_hub: "Fabric received",
  measurements_approved: "Measurements approved",
  in_cutting: "Cutting",
  in_stitching: "Stitching",
  in_qc: "Quality check",
  ready_to_ship: "Ready to ship",
  dispatched: "On its way",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Could not be completed",
};

export const orderStatusLabel = (status: string) => LABELS[status as OrderStatus] ?? "In progress";

// The milestones a customer sees, in order. Several internal statuses roll up
// into one milestone (e.g. fabric received and measurements approved are both
// "Preparing").
export const MILESTONES = [
  { key: "placed", label: "Placed", statuses: ["placed"] },
  { key: "preparing", label: "Preparing", statuses: ["fabric_secured", "received_at_hub", "measurements_approved"] },
  { key: "stitching", label: "Stitching", statuses: ["in_cutting", "in_stitching", "in_qc"] },
  { key: "shipping", label: "On its way", statuses: ["ready_to_ship", "dispatched"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
] as const;

// Index of the milestone the order has reached, or -1 when it has ended
// without delivery (cancelled / failed).
export function milestoneIndex(status: string): number {
  return MILESTONES.findIndex((m) => (m.statuses as readonly string[]).includes(status));
}

export const isClosedWithoutDelivery = (status: string) => status === "cancelled" || status === "failed";

// "11 Nov 2026" for a date ("2026-11-11") or a timestamp.
export const formatOrderDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// Why a customer cancels (FR-CUS-14); "Other" asks for a short note.
export const CANCEL_REASONS = [
  "Ordered by mistake",
  "Changed my mind",
  "Want a different fabric or design",
  "Delivery takes too long",
  "Other",
] as const;
