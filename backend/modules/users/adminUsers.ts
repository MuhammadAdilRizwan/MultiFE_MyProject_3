import type { AccountStatus, AnySupabaseClient, AppRole } from "./types";

// Admin users list and suspend / reactivate (FR-ADM-05, FR-AUTH-08). Runs on
// the admin's own session: "profiles: admin all" lets an active admin read
// every profile, and fn_admin_set_account_status re-checks admin and writes
// the audit entry.

export interface AdminUserRow {
  id: string;
  role: AppRole;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: AccountStatus;
  is_provisional: boolean;
  created_at: string;
}

export interface ListUsersParams {
  role?: AppRole;
  status?: AccountStatus;
  query?: string;
  page?: number;
}

export const USERS_PAGE_SIZE = 25;

// Keeps a search term safe inside a PostgREST or() filter: letters, digits,
// spaces and the characters found in emails and phone numbers only.
export const cleanSearch = (raw: string | undefined) =>
  (raw ?? "").replace(/[^\p{L}\p{N}\s@.+_-]/gu, "").trim().slice(0, 60);

export async function listUsers(
  supabase: AnySupabaseClient,
  params: ListUsersParams = {},
): Promise<{ users: AdminUserRow[]; total: number }> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  let q = supabase
    .from("profiles")
    .select("id, role, full_name, email, phone, status, is_provisional, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * USERS_PAGE_SIZE, page * USERS_PAGE_SIZE - 1);
  if (params.role) q = q.eq("role", params.role);
  if (params.status) q = q.eq("status", params.status);
  const term = cleanSearch(params.query);
  if (term) {
    const digits = term.replace(/\D/g, "");
    const filters = [`full_name.ilike.%${term}%`, `email.ilike.%${term}%`];
    // Phones are stored as +92…; match "0300 123…" by its digits after the 0.
    if (digits.length >= 4) filters.push(`phone.ilike.%${digits.replace(/^0/, "")}%`);
    q = q.or(filters.join(","));
  }
  const { data, error, count } = await q;
  if (error) throw error;
  return { users: (data ?? []) as AdminUserRow[], total: count ?? 0 };
}

export async function setAccountStatus(
  supabase: AnySupabaseClient,
  params: { userId: string; status: AccountStatus; reason?: string },
): Promise<AccountStatus> {
  const { data, error } = await supabase.rpc("fn_admin_set_account_status", {
    p_user_id: params.userId,
    p_status: params.status,
    p_reason: params.reason ?? null,
  });
  if (error) throw error;
  return data as AccountStatus;
}
