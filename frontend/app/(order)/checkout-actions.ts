"use server";

import { z } from "zod";
import { getCurrentAgent } from "@multife/backend/modules/agents/getCurrentAgent";
import { getMyCustomer } from "@multife/backend/modules/agents/getMyCustomer";
import { hasDraftConsent, recordConsent } from "@multife/backend/modules/agents/recordConsent";
import { saveAgentMeasurements } from "@multife/backend/modules/agents/saveAgentMeasurements";
import { getLatestConfirmedProfile } from "@multife/backend/modules/measurements/getMeasurementProfile";
import { saveConfirmedMeasurements } from "@multife/backend/modules/measurements/saveConfirmedMeasurements";
import { placeCodOrder } from "@multife/backend/modules/orders/placeCodOrder";
import { takeSoftReservation } from "@multife/backend/modules/orders/takeSoftReservation";
import { isSelectionSupported } from "@multife/backend/modules/rules/isSelectionSupported";
import { DELIVERY_DAYS, resolveSelection, type ResolvedOption } from "@multife/backend/modules/rules/orderSummary";
import type { PriceBreakdown } from "@multife/backend/modules/rules/priceOrder";
import { validateMeasurements, type MeasurementField } from "@multife/backend/modules/rules/validateMeasurements";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { getMyProfile } from "@multife/backend/modules/users/myProfile";
import type { AnySupabaseClient, ProfileRow } from "@multife/backend/modules/users/types";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { isActionResult, loadAndPriceDraft, type LoadedDraftContext } from "@/lib/draft-pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Measurements → checkout → place order (cash on delivery), for a customer's
// own order or one an agent places for an assigned customer (FR-AGT-03).
// Composes tested backend modules; the only logic here is who may act on
// which draft. Every action runs on the caller's own session, so RLS scopes
// the reads; the order itself is created with the service role only after
// the checks below pass (fn_place_cod_order is service-role only, and
// re-checks the agent's assignment and consent itself).

const GENERIC_ERROR = "Something went wrong. Please try again.";

// Database messages that are safe and useful to show as-is.
const CUSTOMER_FACING = [
  "Not enough fabric in stock",
  "Not enough fabric in stock to confirm this order",
  "Fabric is not available",
  "Measurements are not confirmed",
  "Record the customer's consent first",
];

function customerMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : (error as { message?: unknown })?.message;
  if (typeof message === "string" && CUSTOMER_FACING.includes(message)) return message;
  // No PII or measurement values in logs (FR-AI-10): message only.
  console.error("checkout action failed:", typeof message === "string" ? message : "unknown error");
  return GENERIC_ERROR;
}

type Loaded = {
  actor: ProfileRow;
  // "agent": the signed-in agent placing the order for draft.customer_id.
  mode: "customer" | "agent";
  ctx: LoadedDraftContext;
};

// The draft this session may act on, priced: the customer's own, or one the
// signed-in (active) agent started for a customer still assigned to them.
async function loadDraftForActor(supabase: AnySupabaseClient, draftId: string): Promise<Loaded | ActionResult<never>> {
  const actor = await getCurrentProfile(supabase);
  const role = actor?.status === "active" ? actor.role : null;
  if (!actor || (role !== "customer" && role !== "agent")) {
    return fail("Sign in with your customer account to continue.");
  }

  const ctx = await loadAndPriceDraft(supabase, draftId);
  if (isActionResult(ctx)) return ctx;
  if (ctx.draft.step === "ordered") return fail("This order has already been placed.");

  if (role === "customer") {
    if (ctx.draft.customer_id !== actor.id || ctx.draft.agent_id) return fail("Draft not found.");
    return { actor, mode: "customer", ctx };
  }

  if (ctx.draft.agent_id !== actor.id || !ctx.draft.customer_id) return fail("Draft not found.");
  const agent = await getCurrentAgent(supabase);
  if (!agent || agent.status !== "active") return fail("Your agent account isn't active.");
  if (!(await getMyCustomer(supabase, agent.id, ctx.draft.customer_id))) return fail("This customer isn't assigned to you.");
  return { actor, mode: "agent", ctx };
}

const draftSchema = z.object({ draftId: z.string().uuid() });

export type MeasurementStep = {
  fields: MeasurementField[];
  // Prefill: this draft's confirmed set, else the customer's last confirmed
  // set (FR-CUS-14, including one an agent took at a visit), else nothing.
  values: Record<string, number> | null;
  prefilledFrom: "draft" | "saved" | null;
  mode: "customer" | "agent";
  // Agent mode: whether the customer's consent is on record (FR-AGT-07).
  consentRecorded: boolean;
};

export async function getMeasurementStepAction(input: z.infer<typeof draftSchema>): Promise<ActionResult<MeasurementStep>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");

  try {
    const supabase = await createClient();
    const loaded = await loadDraftForActor(supabase, parsed.data.draftId);
    if (isActionResult(loaded)) return loaded;
    const { ctx, mode } = loaded;
    const fields = ctx.template.required_measurements;
    const pick = (values: Record<string, number>) =>
      Object.fromEntries(fields.filter((f) => typeof values[f.key] === "number").map((f) => [f.key, values[f.key]]));
    const consentRecorded = mode === "agent" ? await hasDraftConsent(supabase, ctx.draft.id) : true;
    const base = { fields, mode, consentRecorded };

    if (ctx.profile) return ok({ ...base, values: pick(ctx.profile.measurement_values), prefilledFrom: "draft" });
    const saved = await getLatestConfirmedProfile(supabase, ctx.draft.customer_id as string);
    if (saved) return ok({ ...base, values: pick(saved.measurement_values), prefilledFrom: "saved" });
    return ok({ ...base, values: null, prefilledFrom: null });
  } catch (error) {
    return fail(customerMessage(error));
  }
}

const recordConsentSchema = z.object({
  draftId: z.string().uuid(),
  method: z.enum(["in_person", "phone_call", "signed_form"]),
  agreed: z.literal(true),
});

// FR-AGT-07: the agent records the customer's consent before taking their
// measurements or placing the order.
export async function recordConsentAction(input: z.infer<typeof recordConsentSchema>): Promise<ActionResult<{ recorded: true }>> {
  const parsed = recordConsentSchema.safeParse(input);
  if (!parsed.success) return fail("Confirm the customer has agreed, and how.");

  try {
    const supabase = await createClient();
    const loaded = await loadDraftForActor(supabase, parsed.data.draftId);
    if (isActionResult(loaded)) return loaded;
    if (loaded.mode !== "agent") return fail("Only an agent records consent.");

    await recordConsent(supabase, { draftId: loaded.ctx.draft.id, method: parsed.data.method });
    return ok({ recorded: true });
  } catch (error) {
    return fail(customerMessage(error));
  }
}

const saveMeasurementsSchema = z.object({
  draftId: z.string().uuid(),
  values: z.record(z.string().max(40), z.union([z.number(), z.string().max(12)])),
  confirmed: z.literal(true),
});

// FR-AI-12: the customer (or the agent acting for them) confirms the
// measurement set; then the fabric is held (soft reservation, FR-FAB-08) for
// the quantity that size needs.
export async function saveMeasurementsAction(
  input: z.infer<typeof saveMeasurementsSchema>,
): Promise<ActionResult<PriceBreakdown>> {
  const parsed = saveMeasurementsSchema.safeParse(input);
  if (!parsed.success) return fail("Please confirm the measurements are correct.");

  try {
    const supabase = await createClient();
    const loaded = await loadDraftForActor(supabase, parsed.data.draftId);
    if (isActionResult(loaded)) return loaded;
    const { ctx, mode, actor } = loaded;

    const checked = validateMeasurements(ctx.template.required_measurements, parsed.data.values);
    if (!checked.ok) return fail(Object.values(checked.errors)[0]);

    if (mode === "agent") {
      await saveAgentMeasurements(supabase, { draftId: ctx.draft.id, values: checked.values });
    } else {
      await saveConfirmedMeasurements(supabase, {
        customerId: actor.id,
        draftId: ctx.draft.id,
        values: checked.values,
        currentProfileId: ctx.draft.measurement_profile_id,
      });
    }

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
  // Prefill for the delivery form: the customer's own details and saved
  // address (FR-CUS-16); empty strings when there are none.
  contact: { fullName: string; phone: string; addressLine: string; city: string };
  mode: "customer" | "agent";
};

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

// "923001234567" (as Supabase stores phones) → "+923001234567"; anything
// already starting with + or a local 0 is left alone.
const displayPhone = (phone: string | null | undefined) =>
  !phone ? "" : phone.startsWith("+") || phone.startsWith("0") ? phone : `+${phone}`;

export async function getCheckoutAction(input: z.infer<typeof draftSchema>): Promise<ActionResult<CheckoutSummary>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");

  try {
    const supabase = await createClient();
    const loaded = await loadDraftForActor(supabase, parsed.data.draftId);
    if (isActionResult(loaded)) return loaded;
    const { ctx, actor, mode } = loaded;
    if (!ctx.profile) return fail("Confirm your measurements first.");
    if (!isSelectionSupported(ctx.evaluatedOptions, ctx.draft.options)) {
      return fail("Some of your choices are no longer offered for this fabric. Please review your design.");
    }

    let contact: CheckoutSummary["contact"];
    if (mode === "agent") {
      const agent = await getCurrentAgent(supabase);
      const customer = agent ? await getMyCustomer(supabase, agent.id, ctx.draft.customer_id as string) : null;
      contact = { fullName: customer?.fullName ?? "", phone: displayPhone(customer?.phone), addressLine: "", city: "" };
    } else {
      const mine = await getMyProfile(supabase, actor.id);
      contact = {
        fullName: mine?.fullName || actor.full_name || "",
        phone: displayPhone(mine?.phone ?? actor.phone),
        addressLine: mine?.address?.address_line ?? "",
        city: mine?.address?.city ?? "",
      };
    }

    const values = ctx.profile.measurement_values;
    return ok({
      pricing: ctx.pricing,
      measurements: ctx.template.required_measurements
        .filter((f) => typeof values[f.key] === "number")
        .map((f) => ({ key: f.key, label: f.label, unit: f.unit, value: values[f.key] })),
      options: resolveSelection(ctx.evaluatedOptions, ctx.draft.options),
      estDeliveryDate: addDays(DELIVERY_DAYS),
      contact,
      mode,
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
// Price, yardage and the option snapshot are all recomputed here from the
// server's own read of the catalogue (FR-TPL-09, SDS §12.4).
export async function placeOrderAction(
  input: z.infer<typeof placeOrderSchema>,
): Promise<ActionResult<{ number: string; mode: "customer" | "agent" }>> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const loaded = await loadDraftForActor(supabase, parsed.data.draftId);
    if (isActionResult(loaded)) return loaded;
    const { ctx, actor, mode } = loaded;
    if (!ctx.profile) return fail("Confirm your measurements first.");
    if (!isSelectionSupported(ctx.evaluatedOptions, ctx.draft.options)) {
      return fail("Some of your choices are no longer offered for this fabric. Please review your design.");
    }

    const { delivery } = parsed.data;
    const order = await placeCodOrder(createAdminClient(), {
      draftId: ctx.draft.id,
      customerId: ctx.draft.customer_id as string,
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
      ...(mode === "agent" ? { placedBy: actor.id } : {}),
    });
    return ok({ number: order.number, mode });
  } catch (error) {
    return fail(customerMessage(error));
  }
}
