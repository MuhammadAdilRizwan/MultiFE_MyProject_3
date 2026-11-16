"use server";

import { z } from "zod";
import { advanceStage } from "@multife/backend/modules/production/advanceStage";
import { approveForProduction } from "@multife/backend/modules/production/approveForProduction";
import { assignProductionJob } from "@multife/backend/modules/production/assignProductionJob";
import { listJobQueue } from "@multife/backend/modules/production/listJobQueue";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { describeError } from "@/lib/describe-error";
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
