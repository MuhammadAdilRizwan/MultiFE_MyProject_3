import "server-only";
import { OPEN_STATUSES, todayInPakistan } from "@/lib/order-status";
import { createClient } from "@/lib/supabase/server";

// Production and delivery for the admin (FR-PRD-05..08, FR-FUL). Admin
// session: "orders / production_jobs / production_remakes / shipments /
// profiles: admin all" let the rows through.

type Assignee = { full_name: string | null; email: string | null; role: string } | null;
type JobRow = {
  id: string;
  stage: string;
  assigned_to_id: string | null;
  created_at: string;
  assignee: Assignee;
  events: { to_stage: string; reason: string | null; created_at: string }[];
  remade: { id: string }[];
};

export type OrderJob = {
  id: string;
  stage: string;
  assignedToId: string | null;
  assignedName: string | null;
  assignedRole: string | null;
};

export type OrderProduction = {
  orderId: string;
  status: string;
  yardageMetres: number | null;
  // The live job, or the failed one waiting for a remake.
  job: OrderJob | null;
  // Set when the job failed QC and no remake has been ordered yet.
  remakeNeeded: { reason: string | null } | null;
  remakes: { reason: string; metresLost: number; at: string }[];
  shipment: {
    courier: string | null;
    trackingRef: string | null;
    status: string;
    attempts: number;
    lastFailureReason: string | null;
  } | null;
  // FR-AI-16: the latest correction sent to the customer, while it matters.
  correction: { status: "pending" | "accepted" | "declined"; reason: string; responseNote: string | null } | null;
  fulfilmentMethod: "delivery" | "collection";
};

const toJob = (j: JobRow): OrderJob => ({
  id: j.id,
  stage: j.stage,
  assignedToId: j.assigned_to_id,
  assignedName: j.assignee ? j.assignee.full_name?.trim() || j.assignee.email : null,
  assignedRole: j.assignee?.role ?? null,
});

export async function getOrderProduction(number: string): Promise<OrderProduction | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, status, yardage_metres, fulfilment_method,
       jobs:production_jobs(id, stage, assigned_to_id, created_at,
         assignee:profiles!production_jobs_assigned_to_id_fkey(full_name, email, role),
         events:production_events(to_stage, reason, created_at),
         remade:production_remakes!production_remakes_original_job_id_fkey(id)),
       shipment:shipments(courier, tracking_ref, status, attempts, last_failure_reason)`,
    )
    .eq("number", number)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    status: string;
    yardage_metres: number | string | null;
    fulfilment_method: string;
    jobs: JobRow[];
    shipment:
      | { courier: string | null; tracking_ref: string | null; status: string; attempts: number; last_failure_reason: string | null }
      | { courier: string | null; tracking_ref: string | null; status: string; attempts: number; last_failure_reason: string | null }[]
      | null;
  };
  const jobs = [...(row.jobs ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const live = jobs.find((j) => j.stage !== "failed");
  const failedWaiting = jobs.find((j) => j.stage === "failed" && j.remade.length === 0);
  const job = live ?? failedWaiting ?? jobs[0];
  const failReason = failedWaiting
    ? [...failedWaiting.events].filter((e) => e.to_stage === "failed").sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.reason ?? null
    : null;

  // Loss per remake (FR-PRD-07).
  const { data: remakes, error: remakesError } = jobs.length
    ? await supabase
        .from("production_remakes")
        .select("reason, fabric_metres_lost, created_at")
        .in("original_job_id", jobs.map((j) => j.id))
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (remakesError) throw remakesError;

  const { data: correction, error: correctionError } = await supabase
    .from("measurement_corrections")
    .select("status, reason, response_note")
    .eq("order_id", row.id)
    .neq("status", "superseded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (correctionError) throw correctionError;
  const c = correction as { status: "pending" | "accepted" | "declined"; reason: string; response_note: string | null } | null;

  const shipment = Array.isArray(row.shipment) ? row.shipment[0] : row.shipment;
  return {
    fulfilmentMethod: row.fulfilment_method === "collection" ? "collection" : "delivery",
    correction: c && row.status === "received_at_hub" ? { status: c.status, reason: c.reason, responseNote: c.response_note } : null,
    orderId: row.id,
    status: row.status,
    yardageMetres: row.yardage_metres === null ? null : Number(row.yardage_metres),
    job: job ? toJob(job) : null,
    remakeNeeded: !live && failedWaiting ? { reason: failReason } : null,
    remakes: ((remakes ?? []) as { reason: string; fabric_metres_lost: number | string; created_at: string }[]).map((r) => ({
      reason: r.reason,
      metresLost: Number(r.fabric_metres_lost),
      at: r.created_at,
    })),
    shipment: shipment
      ? {
          courier: shipment.courier,
          trackingRef: shipment.tracking_ref,
          status: shipment.status,
          attempts: shipment.attempts,
          lastFailureReason: shipment.last_failure_reason,
        }
      : null,
  };
}

export type Attention = {
  overdue: { number: string; status: string; dueDate: string }[];
  overdueCount: number;
  unassignedCount: number;
  remakesWaiting: { number: string }[];
  // FR-AI-16: customers who declined the workshop's measurement changes.
  correctionsDeclined: { number: string }[];
  // FR-NOT-03: emails that gave up after 5 attempts.
  failedEmails: number;
};

// FR-PRD-08 and the admin's production to-dos, for the dashboard.
export async function getProductionAttention(): Promise<Attention> {
  const supabase = await createClient();
  const today = todayInPakistan();

  const [overdue, unassigned, failed, declined, failedEmails] = await Promise.all([
    supabase
      .from("orders")
      .select("number, status, est_delivery_date", { count: "exact" })
      .in("status", [...OPEN_STATUSES])
      .lt("est_delivery_date", today)
      .order("est_delivery_date", { ascending: true })
      .limit(5),
    supabase
      .from("production_jobs")
      .select("id, order:orders!inner(status)", { count: "exact", head: true })
      .is("assigned_to_id", null)
      .not("stage", "in", "(passed,failed)")
      .in("order.status", [...OPEN_STATUSES]),
    supabase
      .from("production_jobs")
      .select("id, order:orders!inner(number, status), remade:production_remakes!production_remakes_original_job_id_fkey(id)")
      .eq("stage", "failed")
      .in("order.status", [...OPEN_STATUSES]),
    supabase
      .from("measurement_corrections")
      .select("order:orders!inner(number, status)")
      .eq("status", "declined")
      .eq("order.status", "received_at_hub"),
    supabase.from("notification_outbox").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);
  if (declined.error) throw declined.error;
  if (failedEmails.error) throw failedEmails.error;
  if (overdue.error) throw overdue.error;
  if (unassigned.error) throw unassigned.error;
  if (failed.error) throw failed.error;

  return {
    overdue: ((overdue.data ?? []) as { number: string; status: string; est_delivery_date: string }[]).map((o) => ({
      number: o.number,
      status: o.status,
      dueDate: o.est_delivery_date,
    })),
    overdueCount: overdue.count ?? 0,
    unassignedCount: unassigned.count ?? 0,
    remakesWaiting: ((failed.data ?? []) as unknown as { order: { number: string }; remade: { id: string }[] }[])
      .filter((j) => j.remade.length === 0)
      .map((j) => ({ number: j.order.number })),
    correctionsDeclined: ((declined.data ?? []) as unknown as { order: { number: string } }[]).map((d) => ({ number: d.order.number })),
    failedEmails: failedEmails.count ?? 0,
  };
}
