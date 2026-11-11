"use server";

import { z } from "zod";
import { getLatestConfirmedProfile } from "@multife/backend/modules/measurements/getMeasurementProfile";
import { saveConfirmedMeasurements } from "@multife/backend/modules/measurements/saveConfirmedMeasurements";
import { placeCodOrder } from "@multife/backend/modules/orders/placeCodOrder";
import { takeSoftReservation } from "@multife/backend/modules/orders/takeSoftReservation";
import { isSelectionSupported } from "@multife/backend/modules/rules/isSelectionSupported";
import { DELIVERY_DAYS, resolveSelection, type ResolvedOption } from "@multife/backend/modules/rules/orderSummary";
import type { PriceBreakdown } from "@multife/backend/modules/rules/priceOrder";
import { validateMeasurements, type MeasurementField } from "@multife/backend/modules/rules/validateMeasurements";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import type { AnySupabaseClient } from "@multife/backend/modules/users/types";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { isActionResult, loadAndPriceDraft, type LoadedDraftContext } from "@/lib/draft-pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Measurements → checkout → place order (cash on delivery). Composes tested
// backend modules; the only logic here is who may act on which draft.
// Every action runs on the customer's own session, so RLS scopes the draft
// and profile reads; the order itself is created with the service role only
// after the checks below pass (fn_place_cod_order is service-role only).

const GENERIC_ERROR = "Something went wrong. Please try again.";

// Database messages that are safe and useful to show the customer as-is.
const CUSTOMER_FACING = [
  "Not enough fabric in stock",
  "Not enough fabric in stock to confirm this order",
  "Fabric is not available",
  "Measurements are not confirmed",
];

function customerMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : (error as { message?: unknown })?.message;
  if (typeof message === "string" && CUSTOMER_FACING.includes(message)) return message;
  // No PII or measurement values in logs (FR-AI-10): message only.
  console.error("checkout action failed:", typeof message === "string" ? message : "unknown error");
  return GENERIC_ERROR;
}

// The signed-in customer's own draft, priced. Fails for guests, other roles,
// and drafts that aren't theirs (an agent's draft isn't checked out here).
async function loadOwnDraft(
  supabase: AnySupabaseClient,
  draftId: string,
): Promise<{ actorId: string; actor: NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>; ctx: LoadedDraftContext } | ActionResult<never>> {
  const actor = await getCurrentProfile(supabase);
  if (!actor || actor.role !== "customer" || actor.status !== "active") {
    return fail("Sign in with your customer account to continue.");
  }
  const ctx = await loadAndPriceDraft(supabase, draftId);
  if (isActionResult(ctx)) return ctx;
  if (ctx.draft.customer_id !== actor.id) return fail("Draft not found.");
  if (ctx.draft.step === "ordered") return fail("This order has already been placed.");
  return { actorId: actor.id, actor, ctx };
}

const draftSchema = z.object({ draftId: z.string().uuid() });

export type MeasurementStep = {
  fields: MeasurementField[];
  // Prefill: this draft's confirmed set, else the customer's last confirmed
  // set (FR-CUS-14), else nothing.
  values: Record<string, number> | null;
  prefilledFrom: "draft" | "saved" | null;
};

export async function getMeasurementStepAction(input: z.infer<typeof draftSchema>): Promise<ActionResult<MeasurementStep>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");

  try {
    const supabase = await createClient();
    const loaded = await loadOwnDraft(supabase, parsed.data.draftId);
    if (isActionResult(loaded)) return loaded;
    const { ctx, actorId } = loaded;
    const fields = ctx.template.required_measurements;
    const pick = (values: Record<string, number>) =>
      Object.fromEntries(fields.filter((f) => typeof values[f.key] === "number").map((f) => [f.key, values[f.key]]));

    if (ctx.profile) return ok({ fields, values: pick(ctx.profile.measurement_values), prefilledFrom: "draft" });
    const saved = await getLatestConfirmedProfile(supabase, actorId);
    if (saved) return ok({ fields, values: pick(saved.measurement_values), prefilledFrom: "saved" });
    return ok({ fields, values: null, prefilledFrom: null });
  } catch (error) {
    return fail(customerMessage(error));
  }
}

const saveMeasurementsSchema = z.object({
  draftId: z.string().uuid(),
  values: z.record(z.string().max(40), z.union([z.number(), z.string().max(12)])),
  confirmed: z.literal(true),
});

// FR-AI-12: the customer confirms their measurement set; then the fabric is
// held (soft reservation, FR-FAB-08) for the quantity their size needs.
export async function saveMeasurementsAction(
  input: z.infer<typeof saveMeasurementsSchema>,
): Promise<ActionResult<PriceBreakdown>> {
  const parsed = saveMeasurementsSchema.safeParse(input);
  if (!parsed.success) return fail("Please confirm your measurements are correct.");

  try {
    const supabase = await createClient();
    const loaded = await loadOwnDraft(supabase, parsed.data.draftId);
    if (isActionResult(loaded)) return loaded;
    const { ctx, actorId } = loaded;

    const checked = validateMeasurements(ctx.template.required_measurements, parsed.data.values);
    if (!checked.ok) return fail(Object.values(checked.errors)[0]);

    await saveConfirmedMeasurements(supabase, {
      customerId: actorId,
      draftId: ctx.draft.id,
      values: checked.values,
      currentProfileId: ctx.draft.measurement_profile_id,
    });

    // Second yardage pass with the confirmed measurements (FR-FAB-16).
    const repriced = await loadAndPriceDraft(supabase, ctx.draft.id);
    if (isActionResult(repriced)) return repriced;
    await takeSoftReservation(supabase, {
      draftId: ctx.draft.id,
      fabricId: repriced.fabric.id,
      metres: repriced.yardageMetres,
    });
    return ok(repriced.pricing);
  } catch (error) {
    return fail(customerMessage(error));
  }
}

export type CheckoutSummary = {
  // Priced from the confirmed measurements (second yardage pass, FR-FAB-16).
  pricing: PriceBreakdown;
  measurements: { key: string; label: string; unit: string; value: number }[];
  options: ResolvedOption[];
  estDeliveryDate: string;
  contact: { fullName: string; phone: string };
};

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export async function getCheckoutAction(input: z.infer<typeof draftSchema>): Promise<ActionResult<CheckoutSummary>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");

  try {
    const supabase = await createClient();
    const loaded = await loadOwnDraft(supabase, parsed.data.draftId);
    if (isActionResult(loaded)) return loaded;
    const { ctx, actor } = loaded;
    if (!ctx.profile) return fail("Confirm your measurements first.");
    if (!isSelectionSupported(ctx.evaluatedOptions, ctx.draft.options)) {
      return fail("Some of your choices are no longer offered for this fabric. Please review your design.");
    }

    const values = ctx.profile.measurement_values;
    return ok({
      pricing: ctx.pricing,
      measurements: ctx.template.required_measurements
        .filter((f) => typeof values[f.key] === "number")
        .map((f) => ({ key: f.key, label: f.label, unit: f.unit, value: values[f.key] })),
      options: resolveSelection(ctx.evaluatedOptions, ctx.draft.options),
      estDeliveryDate: addDays(DELIVERY_DAYS),
      contact: { fullName: actor.full_name ?? "", phone: actor.phone ?? "" },
    });
  } catch (error) {
    return fail(customerMessage(error));
  }
}

const placeOrderSchema = z.object({
  draftId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  delivery: z.object({
    fullName: z.string().trim().min(2, "Enter the recipient's name.").max(80),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9\s-]{6,18}[0-9]$/, "Enter a valid phone number."),
    addressLine: z.string().trim().min(8, "Enter the full delivery address.").max(200),
    city: z.string().trim().min(2, "Enter the city.").max(60),
  }),
});

// Places the order, cash on delivery (agreed until a gateway is chosen).
// Price, yardage and the option snapshot are all recomputed here
// from the server's own read of the catalogue (FR-TPL-09, SDS §12.4).
export async function placeOrderAction(
  input: z.infer<typeof placeOrderSchema>,
): Promise<ActionResult<{ number: string }>> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const loaded = await loadOwnDraft(supabase, parsed.data.draftId);
    if (isActionResult(loaded)) return loaded;
    const { ctx, actorId } = loaded;
    if (!ctx.profile) return fail("Confirm your measurements first.");
    if (!isSelectionSupported(ctx.evaluatedOptions, ctx.draft.options)) {
      return fail("Some of your choices are no longer offered for this fabric. Please review your design.");
    }

    const { delivery } = parsed.data;
    const order = await placeCodOrder(createAdminClient(), {
      draftId: ctx.draft.id,
      customerId: actorId,
      pricing: ctx.pricing,
      leadDays: DELIVERY_DAYS,
      options: resolveSelection(ctx.evaluatedOptions, ctx.draft.options),
      delivery: {
        full_name: delivery.fullName,
        phone: delivery.phone,
        address_line: delivery.addressLine,
        city: delivery.city,
      },
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return ok({ number: order.number });
  } catch (error) {
    return fail(customerMessage(error));
  }
}
