// Production jobs (FR-PRD-*): stage names and the one thing the signed-in
// tailor / QC / dispatch user can do next. Isomorphic: no data access. The
// database (fn_advance_production_stage, fn_transition_order) is what enforces
// every move; this only decides which button to show.

export type ProductionStage = "pending" | "approved" | "cutting" | "stitching" | "qc" | "passed" | "failed";
export type ProductionRole = "tailor" | "qc" | "dispatch";

const STAGE_LABELS: Record<ProductionStage, string> = {
  pending: "Waiting to start",
  approved: "Measurements approved",
  cutting: "Cutting",
  stitching: "Stitching",
  qc: "Quality check",
  passed: "Passed QC",
  failed: "Sent for remake",
};

export const stageLabel = (stage: string) => STAGE_LABELS[stage as ProductionStage] ?? "In progress";

export const ROLE_LABELS: Record<ProductionRole, string> = { tailor: "Tailor", qc: "Quality check", dispatch: "Dispatch" };

export const isProductionRole = (role: string | null | undefined): role is ProductionRole =>
  role === "tailor" || role === "qc" || role === "dispatch";

const CLOSED_ORDER = ["cancelled", "failed"];

// Finished from the workshop's point of view.
export const isJobDone = (stage: string, orderStatus: string) =>
  stage === "passed" || stage === "failed" || CLOSED_ORDER.includes(orderStatus);

// Past its delivery date and not done (FR-PRD-08). `today` is "YYYY-MM-DD".
export const isJobOverdue = (job: { stage: string; orderStatus: string; dueDate: string | null }, today: string) =>
  !!job.dueDate && job.dueDate < today && !isJobDone(job.stage, job.orderStatus);

export type NextStep =
  | { kind: "wait"; text: string }
  | { kind: "closed"; text: string }
  | { kind: "receive" }
  | { kind: "approve" }
  | { kind: "advance"; to: ProductionStage; label: string; hint: string }
  | { kind: "qc" };

export function nextStep(stage: string, orderStatus: string, role: ProductionRole): NextStep {
  if (CLOSED_ORDER.includes(orderStatus)) return { kind: "closed", text: "This order was cancelled. Stop work on it." };
  if (stage === "passed") return { kind: "closed", text: "Passed quality check — ready to ship." };
  if (stage === "failed") return { kind: "closed", text: "Sent to the admin team for a remake." };

  const maker = role === "tailor" || role === "qc";
  if (!maker) return { kind: "wait", text: "Nothing for dispatch to do until this outfit passes quality check." };

  if (stage === "pending") {
    if (orderStatus === "placed") {
      return { kind: "wait", text: "Waiting for the admin team to confirm the fabric is secured from the store." };
    }
    if (orderStatus === "fabric_secured") return { kind: "receive" };
    if (orderStatus === "received_at_hub") return { kind: "approve" };
    return { kind: "wait", text: "Waiting for the order to reach the workshop." };
  }
  if (stage === "approved") {
    return { kind: "advance", to: "cutting", label: "Start cutting", hint: "Cut the fabric to the approved measurements." };
  }
  if (stage === "cutting") {
    return { kind: "advance", to: "stitching", label: "Cutting done — start stitching", hint: "All pieces are cut." };
  }
  if (stage === "stitching") {
    return { kind: "advance", to: "qc", label: "Send to quality check", hint: "The outfit is stitched and finished. It goes to a QC member automatically." };
  }
  if (stage === "qc") {
    return role === "qc" ? { kind: "qc" } : { kind: "wait", text: "Waiting for quality check." };
  }
  return { kind: "wait", text: "Nothing to do on this job right now." };
}

// Step filter on the "To do" list: every open job sits at exactly one step,
// the one its job sheet's button does next (derived from nextStep, so the two
// always agree). In workflow order, start to end.
export type JobStep = "receive" | "approve" | "cut" | "stitch" | "send_qc" | "check" | "waiting";

export const JOB_STEPS: { key: JobStep; label: string }[] = [
  { key: "receive", label: "Fabric received" },
  { key: "approve", label: "Approve measurements" },
  { key: "cut", label: "Start cutting" },
  { key: "stitch", label: "Cutting done – start stitching" },
  { key: "send_qc", label: "Send to quality check" },
  { key: "check", label: "Quality check" },
  { key: "waiting", label: "Waiting" },
];

const ADVANCE_STEP: Partial<Record<ProductionStage, JobStep>> = { cutting: "cut", stitching: "stitch", qc: "send_qc" };

export function jobStep(stage: string, orderStatus: string, role: ProductionRole): JobStep {
  const step = nextStep(stage, orderStatus, role);
  if (step.kind === "receive") return "receive";
  if (step.kind === "approve") return "approve";
  if (step.kind === "qc") return "check";
  if (step.kind === "advance") return ADVANCE_STEP[step.to] ?? "waiting";
  return "waiting";
}

export const jobStepLabel = (step: JobStep) => JOB_STEPS.find((s) => s.key === step)?.label ?? "Waiting";

export const isJobStep = (value: string | undefined): value is JobStep => JOB_STEPS.some((s) => s.key === value);

// The chips a role sees: a tailor's steps run from fabric received to sending
// for quality check; QC also gets "Quality check". "Waiting" only appears
// when something is actually waiting, so it never clutters the row.
export function jobStepsFor(role: ProductionRole, counts: Record<JobStep, number>): JobStep[] {
  return JOB_STEPS.map((s) => s.key).filter((key) => {
    if (key === "check") return role === "qc";
    if (key === "waiting") return counts.waiting > 0;
    return true;
  });
}

export function countJobSteps(jobs: { stage: string; orderStatus: string }[], role: ProductionRole): Record<JobStep, number> {
  const counts = Object.fromEntries(JOB_STEPS.map((s) => [s.key, 0])) as Record<JobStep, number>;
  for (const job of jobs) counts[jobStep(job.stage, job.orderStatus, role)] += 1;
  return counts;
}

// Measurement values the approver changed from the customer's confirmed set
// (FR-AI-15 — a correction needs a reason).
export function changedMeasurements(confirmed: Record<string, number>, approved: Record<string, number>): string[] {
  return Object.keys(approved).filter((key) => confirmed[key] !== undefined && confirmed[key] !== approved[key]);
}

// Highest priority first, then the earliest due date, then the oldest job.
export function sortJobs<T extends { priority: number; dueDate: string | null; createdAt: string }>(jobs: T[]): T[] {
  return [...jobs].sort(
    (a, b) =>
      b.priority - a.priority ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

// FR-AI-16: the largest change on any one measurement, and whether two sets
// match exactly (the customer accepted exactly these values).
export function maxMeasurementChange(confirmed: Record<string, number>, proposed: Record<string, number>): number {
  return Object.keys(proposed).reduce(
    (max, key) => (confirmed[key] === undefined ? max : Math.max(max, Math.abs(proposed[key] - confirmed[key]))),
    0,
  );
}

export function sameMeasurements(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => a[k] === b[k]);
}

// What a staff member did, from the stage their last step moved the job to.
const MY_STEP_LABELS: Record<ProductionStage, string> = {
  pending: "Worked on it",
  approved: "Approved the measurements",
  cutting: "Started cutting",
  stitching: "Stitched it",
  qc: "Sent it to quality check",
  passed: "Passed quality check",
  failed: "Sent it for a remake",
};

export const myStepLabel = (stage: string) => MY_STEP_LABELS[stage as ProductionStage] ?? "Worked on it";
