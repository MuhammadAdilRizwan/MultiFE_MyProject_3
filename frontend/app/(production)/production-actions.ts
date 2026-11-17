"use server";

import { z } from "zod";
import { advanceStage } from "@multife/backend/modules/production/advanceStage";
import { approveForProduction } from "@multife/backend/modules/production/approveForProduction";
import { assignProductionJob } from "@multife/backend/modules/production/assignProductionJob";
import { listJobQueue } from "@multife/backend/modules/production/listJobQueue";
import { requestMeasurementCorrection } from "@multife/backend/modules/production/measurementCorrections";
import { recordFabricReceived } from "@multife/backend/modules/production/recordFabricReceived";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { describeError } from "@/lib/describe-error";
import { kickNotifications } from "@/lib/notifications";
import { getMyJob } from "@/lib/production-jobs";
import { changedMeasurements, maxMeasurementChange, sameMeasurements } from "@/lib/production-stage";
import { createClient } from "@/lib/supabase/server";

// Composes already-tested backend modules (production + users) — no
// business logic of its own, same convention as (agent)/agent-actions.ts.

function isProductionRole(role: string): boolean {
  return role === "tailor" || role === "qc" || role === "dispatch";
}

function isApprovalRole(role: string): boolean {
  return role === "tailor" || role === "qc";
}

export async function listJobQueueAction(): Promise<ActionResult<Awaited<ReturnType<typeof listJobQueue>>>> {
  try {
    const supabase = await createClient();

    const actor = await getCurrentProfile(supabase);
    if (!actor || !isProductionRole(actor.role) || actor.status !== "active") {
      return fail("Sign in as production staff to view your job queue.");
    }

    return ok(await listJobQueue(supabase, actor.id));
  } catch (error) {
    return fail(describeError(error));
  }
}

const assignProductionJobSchema = z.object({
  jobId: z.string().uuid(),
  assignedToId: z.string().uuid(),
});

export async function assignProductionJobAction(
  input: z.infer<typeof assignProductionJobSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof assignProductionJob>>>> {
  const parsed = assignProductionJobSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();

    const actor = await getCurrentProfile(supabase);
    if (!actor || actor.role !== "admin" || actor.status !== "active") {
      return fail("Only an admin can assign a production job.");
    }

    return ok(await assignProductionJob(supabase, parsed.data));
  } catch (error) {
    return fail(describeError(error));
  }
}

const approveForProductionSchema = z.object({
  jobId: z.string().uuid(),
  values: z.record(z.string(), z.number()),
  reason: z.string().min(1).optional(),
});

export async function approveForProductionAction(
  input: z.infer<typeof approveForProductionSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof approveForProduction>>>> {
  const parsed = approveForProductionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();

    const actor = await getCurrentProfile(supabase);
    if (!actor || !isApprovalRole(actor.role) || actor.status !== "active") {
      return fail("Only a tailor or QC can approve measurements for production.");
    }

    return ok(await approveForProduction(supabase, parsed.data));
  } catch (error) {
    return fail(describeError(error));
  }
}

const advanceStageSchema = z.object({
  jobId: z.string().uuid(),
  toStage: z.enum(["pending", "approved", "cutting", "stitching", "qc", "passed", "failed"]),
  reason: z.string().min(1).optional(),
});

export async function advanceStageAction(
  input: z.infer<typeof advanceStageSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof advanceStage>>>> {
  const parsed = advanceStageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();

    const actor = await getCurrentProfile(supabase);
    if (!actor || !isProductionRole(actor.role) || actor.status !== "active") {
      return fail("Sign in as production staff to advance a job.");
    }

    return ok(await advanceStage(supabase, parsed.data));
  } catch (error) {
    return fail(describeError(error));
  }
}

// ---------------------------------------------------------------------------
// Production panel screens (/production). Same checks as above; the database
// functions re-check the role and that the job is assigned to the caller.
// ---------------------------------------------------------------------------

const jobIdSchema = z.object({ jobId: z.string().uuid() });

// FR-PRD-02: the fabric has reached the workshop.
export async function recordFabricReceivedAction(
  input: z.infer<typeof jobIdSchema>,
): Promise<ActionResult<{ status: string }>> {
  const parsed = jobIdSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");

  try {
    const supabase = await createClient();
    const actor = await getCurrentProfile(supabase);
    if (!actor || !isApprovalRole(actor.role) || actor.status !== "active") {
      return fail("Only a tailor or QC can record that the fabric has arrived.");
    }
    const order = await recordFabricReceived(supabase, parsed.data.jobId);
    return ok({ status: order.status });
  } catch (error) {
    return fail(describeError(error));
  }
}

const approveJobSchema = z.object({
  jobId: z.string().uuid(),
  values: z.record(z.string().max(40), z.number().finite()),
  reason: z.string().trim().max(500).optional(),
});

// FR-AI-14/15: the approver checks the confirmed measurements before cutting.
// Changing any value is a correction and needs a reason; the customer's own
// confirmed set is kept on their measurement profile either way.
// FR-AI-16: a change beyond the threshold goes to the customer first
// (outcome "sent_to_customer"); once they accept exactly those values, the
// same call approves them. The database enforces the same rule.
export async function approveJobMeasurementsAction(
  input: z.infer<typeof approveJobSchema>,
): Promise<ActionResult<{ status: string; outcome: "approved" | "sent_to_customer" }>> {
  const parsed = approveJobSchema.safeParse(input);
  if (!parsed.success) return fail("Enter every measurement as a number.");

  try {
    const supabase = await createClient();
    const actor = await getCurrentProfile(supabase);
    if (!actor || !isApprovalRole(actor.role) || actor.status !== "active") {
      return fail("Only a tailor or QC can approve measurements for production.");
    }

    const job = await getMyJob(parsed.data.jobId);
    if (!job) return fail("This job isn't assigned to you.");
    const reason = parsed.data.reason || undefined;
    if (changedMeasurements(job.confirmedMeasurements, parsed.data.values).length > 0 && !reason) {
      return fail("You changed some measurements. Say why, so the change is on record.");
    }

    const big = maxMeasurementChange(job.confirmedMeasurements, parsed.data.values) > job.correctionThreshold;
    const accepted = job.correction?.status === "accepted" && sameMeasurements(job.correction.proposed, parsed.data.values);
    if (big && !accepted) {
      await requestMeasurementCorrection(supabase, { jobId: parsed.data.jobId, values: parsed.data.values, reason: reason as string });
      kickNotifications(); // measurement_correction email
      return ok({ status: job.orderStatus, outcome: "sent_to_customer" });
    }

    const order = await approveForProduction(supabase, { jobId: parsed.data.jobId, values: parsed.data.values, reason });
    return ok({ status: order.status, outcome: "approved" });
  } catch (error) {
    return fail(describeError(error));
  }
}
