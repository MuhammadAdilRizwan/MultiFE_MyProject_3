import type { AnySupabaseClient } from "./types";

// FR-AUTH-09: a customer asks to delete their account; an admin approves or
// declines. Everything runs on the caller's own session: RLS lets a customer
// read only their own requests and an admin read all, and the functions in
// migration 20261124100000 re-check who's calling, enforce one open request
// per customer, refuse completion while an order is in progress, and write
// the audit log. Completion wipes the person (sign-in, name, contact,
// address, measurement sets) and keeps their orders anonymously.

export type DeletionRequestStatus = "pending" | "withdrawn" | "declined" | "completed";

export interface MyDeletionRequest {
  id: string;
  status: DeletionRequestStatus;
  reason: string | null;
  requestedAt: string;
  resolvedAt: string | null;
  adminNote: string | null;
}

export interface MyDeletionState {
  // The latest request, if any (withdrawn ones are treated as none).
  request: MyDeletionRequest | null;
  // Orders not yet delivered or cancelled: the admin waits for these.
  openOrders: number;
}

type RequestRow = {
  id: string;
  status: DeletionRequestStatus;
  reason: string | null;
  requested_at: string;
  resolved_at: string | null;
  admin_note: string | null;
};

const toRequest = (row: RequestRow): MyDeletionRequest => ({
  id: row.id,
  status: row.status,
  reason: row.reason,
  requestedAt: row.requested_at,
  resolvedAt: row.resolved_at,
  adminNote: row.admin_note,
});

// Same "open" as fn_customer_open_order_count.
const CLOSED_ORDER_STATUSES = "(delivered,cancelled,failed)";

export async function getMyDeletionState(supabase: AnySupabaseClient, userId: string): Promise<MyDeletionState> {
  const [latest, open] = await Promise.all([
    supabase
      .from("account_deletion_requests")
      .select("id, status, reason, requested_at, resolved_at, admin_note")
      .eq("user_id", userId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", userId)
      .not("status", "in", CLOSED_ORDER_STATUSES),
  ]);
  if (latest.error) throw latest.error;
  if (open.error) throw open.error;
  const row = latest.data as RequestRow | null;
  return {
    request: row && row.status !== "withdrawn" ? toRequest(row) : null,
    openOrders: open.count ?? 0,
  };
}

export async function requestAccountDeletion(supabase: AnySupabaseClient, params: { reason?: string | null }): Promise<string> {
  const { data, error } = await supabase.rpc("fn_request_account_deletion", { p_reason: params.reason ?? null });
  if (error) throw error;
  return data as string;
}

export async function withdrawAccountDeletion(supabase: AnySupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("fn_withdraw_account_deletion");
  if (error) throw error;
  return data === true;
}

// --- Admin -------------------------------------------------------------------

export interface AdminDeletionRequest {
  id: string;
  userId: string;
  status: DeletionRequestStatus;
  reason: string | null;
  requestedAt: string;
  resolvedAt: string | null;
  adminNote: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  // Pending requests only: orders the customer still has in progress.
  openOrders: number;
}

type AdminRow = RequestRow & {
  user_id: string;
  person: { full_name: string | null; email: string | null; phone: string | null } | null;
};

export const RECENT_DELETIONS_LIMIT = 20;

// Pending requests (oldest first) and the most recently resolved ones.
export async function listDeletionRequests(
  supabase: AnySupabaseClient,
): Promise<{ pending: AdminDeletionRequest[]; recent: AdminDeletionRequest[] }> {
  const columns =
    "id, user_id, status, reason, requested_at, resolved_at, admin_note, person:profiles!account_deletion_requests_user_id_fkey(full_name, email, phone)";
  const [pending, recent] = await Promise.all([
    supabase.from("account_deletion_requests").select(columns).eq("status", "pending").order("requested_at").limit(200),
    supabase
      .from("account_deletion_requests")
      .select(columns)
      .neq("status", "pending")
      .order("resolved_at", { ascending: false, nullsFirst: false })
      .limit(RECENT_DELETIONS_LIMIT),
  ]);
  if (pending.error) throw pending.error;
  if (recent.error) throw recent.error;

  const pendingRows = (pending.data ?? []) as unknown as AdminRow[];
  const counts = new Map<string, number>();
  if (pendingRows.length > 0) {
    const { data, error } = await supabase.rpc("fn_admin_open_order_counts", {
      p_user_ids: [...new Set(pendingRows.map((r) => r.user_id))],
    });
    if (error) throw error;
    for (const row of (data ?? []) as { user_id: string; open_orders: number }[]) counts.set(row.user_id, row.open_orders);
  }

  const toAdmin = (row: AdminRow): AdminDeletionRequest => ({
    ...toRequest(row),
    userId: row.user_id,
    name: row.person?.full_name ?? null,
    email: row.person?.email ?? null,
    phone: row.person?.phone ?? null,
    openOrders: row.status === "pending" ? (counts.get(row.user_id) ?? 0) : 0,
  });
  return { pending: pendingRows.map(toAdmin), recent: ((recent.data ?? []) as unknown as AdminRow[]).map(toAdmin) };
}

export async function countPendingDeletionRequests(supabase: AnySupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("account_deletion_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

export async function completeAccountDeletion(
  supabase: AnySupabaseClient,
  params: { requestId: string },
): Promise<{ ordersKept: number }> {
  const { data, error } = await supabase.rpc("fn_admin_complete_account_deletion", { p_request_id: params.requestId });
  if (error) throw error;
  return { ordersKept: Number((data as { orders_kept?: number } | null)?.orders_kept ?? 0) };
}

export async function declineAccountDeletion(
  supabase: AnySupabaseClient,
  params: { requestId: string; note: string },
): Promise<void> {
  const { error } = await supabase.rpc("fn_admin_decline_account_deletion", {
    p_request_id: params.requestId,
    p_note: params.note,
  });
  if (error) throw error;
}
