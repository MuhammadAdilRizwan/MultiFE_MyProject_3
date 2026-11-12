import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { USERS_PAGE_SIZE, listUsers, type AdminUserRow } from "@multife/backend/modules/users/adminUsers";
import type { AppRole } from "@multife/backend/modules/users/types";
import { Pager, PageHeading, SearchForm } from "@/components/admin/list-controls";
import { Alert } from "@/components/ui/alert";
import { activeAdmin } from "@/lib/active-admin";
import { formatOrderDate } from "@/lib/order-status";
import { formatPhone } from "@/lib/phone";
import { StatusControl } from "./status-control";

export const metadata: Metadata = { title: "Users" };

const ROLE_FILTERS: { key: string; label: string; role?: AppRole; staff?: boolean }[] = [
  { key: "all", label: "All" },
  { key: "customer", label: "Customers", role: "customer" },
  { key: "agent", label: "Agents", role: "agent" },
  { key: "admin", label: "Admins", role: "admin" },
  { key: "tailor", label: "Tailors", role: "tailor" },
  { key: "qc", label: "QC", role: "qc" },
  { key: "dispatch", label: "Dispatch", role: "dispatch" },
  { key: "supplier_contact", label: "Store contacts", role: "supplier_contact" },
];

const ROLE_LABEL: Record<string, string> = {
  customer: "Customer",
  agent: "Agent",
  admin: "Admin",
  tailor: "Tailor",
  qc: "QC",
  dispatch: "Dispatch",
  supplier_contact: "Store contact",
};

type Props = { searchParams: Promise<{ role?: string; status?: string; q?: string; page?: string }> };

export default async function AdminUsersPage({ searchParams }: Props) {
  const params = await searchParams;
  const roleFilter = ROLE_FILTERS.find((f) => f.key === params.role) ?? ROLE_FILTERS[0];
  const suspendedOnly = params.status === "suspended";
  const search = (params.q ?? "").slice(0, 60);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  let result: { users: AdminUserRow[]; total: number } | null = null;
  let adminId: string | null = null;
  try {
    const admin = await activeAdmin();
    if (admin) {
      adminId = admin.adminId;
      result = await listUsers(admin.supabase, { role: roleFilter.role, status: suspendedOnly ? "suspended" : undefined, query: search, page });
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error("listUsers failed:", error instanceof Error ? error.message : "unknown error");
  }

  const href = (over: { role?: string; suspended?: boolean; page?: number }) => {
    const sp = new URLSearchParams();
    const role = over.role ?? roleFilter.key;
    const suspended = over.suspended ?? suspendedOnly;
    if (role !== "all") sp.set("role", role);
    if (suspended) sp.set("status", "suspended");
    if (search) sp.set("q", search);
    if (over.page && over.page > 1) sp.set("page", String(over.page));
    const qs = sp.toString();
    return `/admin/users${qs ? `?${qs}` : ""}`;
  };
  const chip = (active: boolean) =>
    `inline-flex h-9 flex-none items-center rounded-full border px-4 text-sm font-semibold transition-colors ${
      active ? "border-transparent bg-mf-blue text-white shadow-blue" : "border-line bg-white text-muted hover:text-ocean"
    }`;

  return (
    <div>
      <PageHeading title="Users" text="Everyone with a MultiFe account. Suspend an account to sign it out and block sign-in and ordering; reactivate it any time." />

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter by role" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {ROLE_FILTERS.map((f) => (
            <Link key={f.key} href={href({ role: f.key, page: 1 })} aria-current={f.key === roleFilter.key ? "page" : undefined} className={chip(f.key === roleFilter.key)}>
              {f.label}
            </Link>
          ))}
          <Link href={href({ suspended: !suspendedOnly, page: 1 })} aria-pressed={suspendedOnly} className={chip(suspendedOnly)}>
            Suspended only
          </Link>
        </nav>
        <SearchForm
          action="/admin/users"
          defaultValue={search}
          placeholder="Name, email or phone"
          hidden={{ role: roleFilter.key === "all" ? undefined : roleFilter.key, status: suspendedOnly ? "suspended" : undefined }}
        />
      </div>

      {!result ? (
        <div className="mt-8">
          <Alert tone="danger">We couldn&apos;t load the users. Please refresh.</Alert>
        </div>
      ) : result.users.length === 0 ? (
        <p className="mt-10 text-center text-base text-muted">{search ? <>No users match &ldquo;{search}&rdquo;.</> : "No users here."}</p>
      ) : (
        <>
          <ul className="mt-6 space-y-2">
            {result.users.map((u) => {
              const name = u.full_name || u.email || "Unnamed user";
              return (
                <li key={u.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-ink">{name}</span>
                      <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold text-ink">{ROLE_LABEL[u.role] ?? u.role}</span>
                      {u.status === "suspended" && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">Suspended</span>}
                      {u.is_provisional && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">Invite not accepted</span>}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-muted">
                      {[u.email, u.phone ? formatPhone(u.phone) : null].filter(Boolean).join(" · ") || "No contact details"}
                    </p>
                    <p className="text-xs text-hint">Joined {formatOrderDate(u.created_at)}</p>
                  </div>
                  <StatusControl key={`${u.id}-${u.status}`} userId={u.id} name={name} status={u.status} isSelf={u.id === adminId} />
                </li>
              );
            })}
          </ul>
          <Pager page={page} total={result.total} pageSize={USERS_PAGE_SIZE} href={(p) => href({ page: p })} noun="users" />
        </>
      )}
    </div>
  );
}
