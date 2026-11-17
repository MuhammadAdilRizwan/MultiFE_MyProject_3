"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { respondMeasurementCorrection } from "@multife/backend/modules/production/measurementCorrections";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { describeError } from "@/lib/describe-error";
import { createClient } from "@/lib/supabase/server";

// FR-AI-16: the customer — or the agent who placed the order for them —
// accepts or declines the workshop's measurement correction.
// fn_respond_measurement_correction checks it's their order and still open.

const schema = z
  .object({
    correctionId: z.string().uuid(),
    accept: z.boolean(),
    note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
  })
  .refine((v) => v.accept || (v.note?.length ?? 0) >= 3, { message: "Tell us what's wrong so we can contact you.", path: ["note"] });

const SAFE = ["This correction has already been answered", "Tell us what's wrong so we can contact you"];

export async function respondToCorrectionAction(input: z.infer<typeof schema>): Promise<ActionResult<{ status: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const actor = await getCurrentProfile(supabase);
    if (!actor || actor.status !== "active" || (actor.role !== "customer" && actor.role !== "agent")) {
      return fail("Sign in to answer this.");
    }
    const row = await respondMeasurementCorrection(supabase, {
      correctionId: parsed.data.correctionId,
      accept: parsed.data.accept,
      note: parsed.data.note || undefined,
    });
    revalidatePath("/account/orders", "layout");
    revalidatePath("/agent/orders", "layout");
    return ok({ status: row.status });
  } catch (error) {
    const message = describeError(error);
    return fail(SAFE.includes(message) ? message : "We couldn't save your answer. Please try again.");
  }
}
