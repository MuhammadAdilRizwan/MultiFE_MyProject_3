import type { AnySupabaseClient } from "./types";

// FR-ADM-06 / UC-12: an admin cancels an order or annotates it.

// fn_transition_order lets an admin cancel at any point before delivery with
// a reason: it releases the fabric hold, raises a refund record when the
// order was paid, writes history and the audit entry, and emails the customer.
export async function adminCancelOrder(
  supabase: AnySupabaseClient,
  params: { orderId: string; reason: string },
): Promise<{ status: string; payment_status: string }> {
  const { data, error } = await supabase.rpc("fn_transition_order", {
    p_order_id: params.orderId,
    p_to_status: "cancelled",
    p_actor_role: "admin",
    p_reason: params.reason,
  });
  if (error) throw error;
  const row = data as { status: string; payment_status: string };
  return { status: row.status, payment_status: row.payment_status };
}

export type OrderNoteKind = "note" | "dispute_opened" | "dispute_resolved";

export interface OrderNoteRow {
  id: string;
  order_id: string;
  author_id: string | null;
  kind: OrderNoteKind;
  body: string;
  created_at: string;
}

// An internal note, or opening / resolving a dispute (fn_admin_add_order_note
// keeps orders.dispute_opened_at in step and audits it).
export async function addOrderNote(
  supabase: AnySupabaseClient,
  params: { orderId: string; kind: OrderNoteKind; body: string },
): Promise<OrderNoteRow> {
  const { data, error } = await supabase.rpc("fn_admin_add_order_note", {
    p_order_id: params.orderId,
    p_kind: params.kind,
    p_body: params.body,
  });
  if (error) throw error;
  return data as OrderNoteRow;
}
