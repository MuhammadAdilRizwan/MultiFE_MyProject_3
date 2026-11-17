import type { Metadata } from "next";
import Link from "next/link";
import { Pager, PageHeading, SearchForm } from "@/components/admin/list-controls";
import { Alert } from "@/components/ui/alert";
import { AUDIT_AREAS, auditActionLabel, auditArea, auditSummary } from "@/lib/audit-labels";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Row = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
  actor: { full_name: string | null; email: string | null; role: string } | null;
};

type Props = { searchParams: Promise<{ area?: string; q?: string; page?: string }> };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

// FR-ADM-10: every recorded action, newest first. Admin session
// ("audit_log: admin read"); search matches who did it (name or email).
export default async function AuditLogPage({ searchParams }: Props) {
  const params = await searchParams;
  const area = auditArea(params.area);
  const search = (params.q ?? "").replace(/[^\p{L}\p{N}\s@.\-_]/gu, "").trim().slice(0, 60);
  const page = Math.max(1, Math.floor(Number(params.page) || 1));

  const supabase = await createClient();
  const actorJoin = search ? "actor:profiles!inner(full_name, email, role)" : "actor:profiles(full_name, email, role)";
  let query = supabase
    .from("audit_log")
    .select(`id, action, entity, entity_id, before, after, created_at, ${actorJoin}`, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (area.prefix) query = query.like("action", `${area.prefix}%`);
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`, { referencedTable: "actor" });
  const { data, error, count } = await query;
  const rows = (data ?? []) as unknown as Row[];

  // Order numbers for entries about an order, to link to them.
  const orderIds = [...new Set(rows.filter((r) => r.entity === "orders" && r.entity_id).map((r) => r.entity_id as string))];
  const { data: orders } = orderIds.length
    ? await supabase.from("orders").select("id, number").in("id", orderIds)
    : { data: [] as { id: string; number: string }[] };
  const numbers = new Map(((orders ?? []) as { id: string; number: string }[]).map((o) => [o.id, o.number]));

  const href = (over: { area?: string; page?: number }) => {
    const sp = new URLSearchParams();
    const a = over.area ?? area.key;
    if (a !== "all") sp.set("area", a);
    if (search) sp.set("q", search);
    if ((over.page ?? 1) > 1) sp.set("page", String(over.page));
    const s = sp.toString();
    return s ? `/admin/audit?${s}` : "/admin/audit";
  };
  const chip = (active: boolean) =>
    `inline-flex h-9 flex-none items-center rounded-full border px-4 text-sm font-semibold transition-colors ${
      active ? "border-transparent bg-mf-blue text-white shadow-blue" : "border-line bg-white text-ink hover:border-cyan-bright/60"
    }`;

  return (
    <div>
      <PageHeading title="Audit log" text="Everything that changed who can do what, and every important step on an order: who did it, when, and what changed." />

      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter by area" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {AUDIT_AREAS.map((a) => (
            <Link key={a.key} href={href({ area: a.key, page: 1 })} aria-current={a.key === area.key ? "page" : undefined} className={chip(a.key === area.key)}>
              {a.label}
            </Link>
          ))}
        </nav>
        <SearchForm action="/admin/audit" defaultValue={search} placeholder="Who did it: name or email" hidden={{ area: area.key === "all" ? undefined : area.key }} />
      </div>

      {error ? (
        <div className="mt-8">
          <Alert tone="danger">We couldn&apos;t load the audit log. Please refresh.</Alert>
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-center text-base text-muted">{search ? <>Nothing by &ldquo;{search}&rdquo; here.</> : "Nothing recorded here yet."}</p>
      ) : (
        <>
          <ul className="mt-6 space-y-2">
            {rows.map((r) => {
              const summary = auditSummary(r.before, r.after);
              const orderNumber = r.entity === "orders" && r.entity_id ? numbers.get(r.entity_id) : undefined;
              return (
                <li key={r.id} className="rounded-2xl border border-line bg-white p-4 shadow-card">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-bold text-ink">
                      {auditActionLabel(r.action)}
                      {orderNumber && (
                        <>
                          {" · "}
                          <Link href={`/admin/orders/${orderNumber}`} className="text-ocean hover:underline">
                            {orderNumber}
                          </Link>
                        </>
                      )}
                    </p>
                    <time dateTime={r.created_at} className="text-xs text-muted">
                      {when(r.created_at)}
                    </time>
                  </div>
                  {summary && <p className="mt-0.5 text-sm text-ink">{summary}</p>}
                  <p className="text-xs text-muted">
                    by {r.actor ? `${r.actor.full_name?.trim() || r.actor.email} (${r.actor.role})` : "the system"}
                  </p>
                  {(r.before !== null || r.after !== null) && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer font-semibold text-ocean">Details</summary>
                      <pre className="mt-2 overflow-x-auto rounded-xl bg-cream/70 p-3 text-[11px] leading-5 text-ink">
                        {JSON.stringify({ before: r.before, after: r.after, record: `${r.entity}/${r.entity_id ?? "-"}` }, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          <Pager page={page} total={count ?? 0} pageSize={PAGE_SIZE} href={(p) => href({ page: p })} noun="entries" />
        </>
      )}
    </div>
  );
}
