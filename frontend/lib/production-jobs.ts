import "server-only";
import type { MeasurementField } from "@multife/backend/modules/rules/validateMeasurements";
import type { ResolvedOption } from "@multife/backend/modules/rules/orderSummary";
import { sortJobs } from "@/lib/production-stage";
import { createClient } from "@/lib/supabase/server";

// The signed-in tailor / QC / dispatch user's jobs (FR-PRD-05) and one job's
// sheet (FR-PRD-09). Session client only: RLS ("production_jobs: assigned
// staff", production_order_view, "order_items / dress_templates / fabrics /
// measurement_profiles: production reads on assigned jobs") limits every read
// to jobs assigned to this user. Production staff never see prices, payment
// or the customer's identity — none of those are selected or readable.

export type JobListItem = {
  id: string;
  stage: string;
  priority: number;
  orderNumber: string;
  orderStatus: string;
  templateName: string;
  fabricName: string | null;
  fabricImage: string | null;
  dueDate: string | null;
  createdAt: string;
};

export type JobEvent = { fromStage: string | null; toStage: string; at: string; reason: string | null; byMe: boolean };

export type JobSheet = JobListItem & {
  yardageMetres: number | null;
  options: ResolvedOption[];
  // On the order item: the customer's confirmed set until approval, then the
  // approved (possibly corrected) set.
  measurements: Record<string, number>;
  // The customer's own confirmed set, kept unchanged (FR-AI-15).
  confirmedMeasurements: Record<string, number>;
  requiredFields: MeasurementField[];
  approvedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  events: JobEvent[];
  // FR-AI-16: a change above this (cm, on any one measurement) needs the
  // customer's OK; the latest such request for this job, if any.
  correctionThreshold: number;
  correction: {
    status: "pending" | "accepted" | "declined";
    proposed: Record<string, number>;
    reason: string;
    responseNote: string | null;
    respondedAt: string | null;
    createdAt: string;
  } | null;
};

type JobRow = {
  id: string;
  order_id: string;
  stage: string;
  priority: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type OrderViewRow = {
  id: string;
  number: string;
  status: string;
  template_id: string;
  fabric_id: string;
  measurement_profile_id: string | null;
  production_approved_at: string | null;
  yardage_metres: number | string | null;
  est_delivery_date: string | null;
};

type ItemRow = { order_id: string; template_name: string; options: unknown; measurements: Record<string, number> | null };
type FabricRow = { id: string; name: string; display_name: string | null; images: { url: string; sort: number }[] };

const JOB_COLUMNS = "id, order_id, stage, priority, started_at, finished_at, created_at";
const ORDER_COLUMNS =
  "id, number, status, template_id, fabric_id, measurement_profile_id, production_approved_at, yardage_metres, est_delivery_date";

async function ordersFor(supabase: Awaited<ReturnType<typeof createClient>>, orderIds: string[]) {
  const [orders, items] = await Promise.all([
    supabase.from("production_order_view").select(ORDER_COLUMNS).in("id", orderIds),
    supabase.from("order_items").select("order_id, template_name, options, measurements").in("order_id", orderIds),
  ]);
  if (orders.error) throw orders.error;
  if (items.error) throw items.error;
  const orderRows = (orders.data ?? []) as OrderViewRow[];

  const fabricIds = [...new Set(orderRows.map((o) => o.fabric_id))];
  const fabrics = fabricIds.length
    ? await supabase.from("fabrics").select("id, name, display_name, images:fabric_images(url, sort)").in("id", fabricIds)
    : { data: [], error: null };
  if (fabrics.error) throw fabrics.error;

  return {
    orders: new Map(orderRows.map((o) => [o.id, o])),
    items: new Map(((items.data ?? []) as ItemRow[]).map((i) => [i.order_id, i])),
    fabrics: new Map(((fabrics.data ?? []) as unknown as FabricRow[]).map((f) => [f.id, f])),
  };
}

function toListItem(
  job: JobRow,
  order: OrderViewRow,
  item: ItemRow | undefined,
  fabric: FabricRow | undefined,
): JobListItem {
  const images = [...(fabric?.images ?? [])].sort((a, b) => a.sort - b.sort);
  return {
    id: job.id,
    stage: job.stage,
    priority: job.priority,
    orderNumber: order.number,
    orderStatus: order.status,
    templateName: item?.template_name ?? "Custom outfit",
    fabricName: fabric ? fabric.display_name || fabric.name : null,
    fabricImage: images[0]?.url ?? null,
    dueDate: order.est_delivery_date,
    createdAt: job.created_at,
  };
}

export async function listMyJobs(): Promise<JobListItem[]> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await supabase.from("production_jobs").select(JOB_COLUMNS).eq("assigned_to_id", auth.user.id);
  if (error) throw error;
  const jobs = (data ?? []) as JobRow[];
  if (jobs.length === 0) return [];

  const { orders, items, fabrics } = await ordersFor(supabase, jobs.map((j) => j.order_id));
  return sortJobs(
    jobs.flatMap((job) => {
      const order = orders.get(job.order_id);
      return order ? [toListItem(job, order, items.get(order.id), fabrics.get(order.fabric_id))] : [];
    }),
  );
}

export async function getMyJob(jobId: string): Promise<JobSheet | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("production_jobs")
    .select(JOB_COLUMNS)
    .eq("id", jobId)
    .eq("assigned_to_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const job = data as JobRow;

  const { orders, items, fabrics } = await ordersFor(supabase, [job.order_id]);
  const order = orders.get(job.order_id);
  if (!order) return null;
  const item = items.get(order.id);

  const [template, profile, events, threshold, correction] = await Promise.all([
    supabase.from("dress_templates").select("required_measurements").eq("id", order.template_id).maybeSingle(),
    order.measurement_profile_id
      ? supabase.from("measurement_profiles").select("measurement_values").eq("id", order.measurement_profile_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("production_events")
      .select("from_stage, to_stage, actor_id, reason, created_at")
      .eq("job_id", job.id)
      .order("created_at", { ascending: true }),
    supabase.rpc("fn_measurement_correction_threshold"),
    supabase
      .from("measurement_corrections")
      .select("status, proposed, reason, response_note, responded_at, created_at")
      .eq("job_id", job.id)
      .neq("status", "superseded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (template.error) throw template.error;
  if (profile.error) throw profile.error;
  if (events.error) throw events.error;
  if (threshold.error) throw threshold.error;
  if (correction.error) throw correction.error;
  const c = correction.data as {
    status: "pending" | "accepted" | "declined";
    proposed: Record<string, number>;
    reason: string;
    response_note: string | null;
    responded_at: string | null;
    created_at: string;
  } | null;

  const measurements = item?.measurements ?? {};
  return {
    ...toListItem(job, order, item, fabrics.get(order.fabric_id)),
    yardageMetres: order.yardage_metres === null ? null : Number(order.yardage_metres),
    options: Array.isArray(item?.options) ? (item.options as ResolvedOption[]) : [],
    measurements,
    confirmedMeasurements:
      (profile.data as { measurement_values: Record<string, number> } | null)?.measurement_values ?? measurements,
    requiredFields: ((template.data as { required_measurements: MeasurementField[] } | null)?.required_measurements ?? []),
    approvedAt: order.production_approved_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    events: (
      (events.data ?? []) as { from_stage: string | null; to_stage: string; actor_id: string | null; reason: string | null; created_at: string }[]
    ).map((e) => ({
      fromStage: e.from_stage,
      toStage: e.to_stage,
      at: e.created_at,
      reason: e.reason,
      byMe: e.actor_id === auth.user.id,
    })),
    correctionThreshold: Number(threshold.data),
    correction: c
      ? { status: c.status, proposed: c.proposed, reason: c.reason, responseNote: c.response_note, respondedAt: c.responded_at, createdAt: c.created_at }
      : null,
  };
}
