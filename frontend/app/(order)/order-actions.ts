"use server";

import { z } from "zod";
import { getFabric } from "@multife/backend/modules/catalog/getFabric";
import { getTemplate } from "@multife/backend/modules/catalog/getTemplate";
import type { TemplateOptionRow } from "@multife/backend/modules/catalog/types";
import { createDraft } from "@multife/backend/modules/orders/createDraft";
import { getDraft } from "@multife/backend/modules/orders/getDraft";
import { takeSoftReservation } from "@multife/backend/modules/orders/takeSoftReservation";
import { updateDraftOptions } from "@multife/backend/modules/orders/updateDraftOptions";
import type { AnySupabaseClient, OrderDraftRow } from "@multife/backend/modules/orders/types";
import { estimateYardage } from "@multife/backend/modules/rules/estimateYardage";
import { evaluateOptions } from "@multife/backend/modules/rules/evaluateOptions";
import { isSelectionSupported } from "@multife/backend/modules/rules/isSelectionSupported";
import { isTemplateCompatibleWithFabric } from "@multife/backend/modules/rules/isTemplateCompatibleWithFabric";
import { priceOrder, type PriceBreakdown } from "@multife/backend/modules/rules/priceOrder";
import type { TemplateOptionInput } from "@multife/backend/modules/rules/types";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { nominalMeasurements } from "@/lib/catalog";
import { describeError } from "@/lib/describe-error";
import { createClient } from "@/lib/supabase/server";

// Composes already-tested backend modules (catalog + rules + orders) — no
// business logic of its own, same convention as (storefront)/catalog-actions.ts.

function toTemplateOptionInputs(options: TemplateOptionRow[]): TemplateOptionInput[] {
  return options.map((option) => ({
    groupKey: option.group.key,
    groupLabel: option.group.label,
    valueKey: option.value.key,
    valueLabel: option.value.label,
    priceDelta: option.price_delta,
    extraLeadDays: option.extra_lead_days,
    isDefault: option.is_default,
  }));
}

interface LoadedDraftContext {
  draft: OrderDraftRow;
  evaluatedOptions: ReturnType<typeof evaluateOptions>;
  yardageMetres: number;
  pricing: PriceBreakdown;
}

// Shared by priceDraftAction and takeSoftReservationAction: load the draft's
// fabric+template, re-evaluate its option set, and price it. Never trusts a
// previously stored price — always recomputed from the current catalogue.
async function loadAndPriceDraft(
  supabase: AnySupabaseClient,
  draftId: string,
): Promise<LoadedDraftContext | ActionResult<never>> {
  const draft = await getDraft(supabase, draftId);
  if (!draft) return fail("Draft not found.");
  if (!draft.fabric_id || !draft.template_id) return fail("Pick a fabric and template first.");

  const fabric = await getFabric(supabase, draft.fabric_id);
  if (!fabric) return fail("Fabric not found.");
  const template = await getTemplate(supabase, draft.template_id);
  if (!template) return fail("Template not found.");

  const evaluatedOptions = evaluateOptions(toTemplateOptionInputs(template.options), fabric.supported_options);

  const yardageMetres = estimateYardage({
    yardageFormula: template.yardage_formula,
    measurements: nominalMeasurements(template.required_measurements),
    selection: draft.options,
    fabricHasDirectionalPattern: Boolean(fabric.properties?.directional_pattern),
  });

  const pricing = priceOrder({
    fabricPricePerMetre: fabric.price_per_metre,
    templateBaseStitchPrice: template.base_stitch_price,
    yardageMetres,
    evaluatedOptions,
    selection: draft.options,
  });

  return { draft, evaluatedOptions, yardageMetres, pricing };
}

function isActionResult(value: unknown): value is ActionResult<never> {
  return typeof value === "object" && value !== null && "ok" in value;
}

const createDraftSchema = z.object({
  fabricId: z.string().uuid(),
  templateId: z.string().uuid(),
});

export async function createDraftAction(
  input: z.infer<typeof createDraftSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof createDraft>>>> {
  const parsed = createDraftSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();

    const actor = await getCurrentProfile(supabase);
    if (!actor || actor.role !== "customer" || actor.status !== "active") {
      return fail("Sign in as a customer to start an order.");
    }

    const fabric = await getFabric(supabase, parsed.data.fabricId);
    if (!fabric) return fail("Fabric not found.");
    const template = await getTemplate(supabase, parsed.data.templateId);
    if (!template) return fail("Template not found.");

    if (!isTemplateCompatibleWithFabric(toTemplateOptionInputs(template.options), fabric.supported_options)) {
      return fail("This template isn't available in the chosen fabric.");
    }

    return ok(
      await createDraft(supabase, {
        customerId: actor.id,
        fabricId: parsed.data.fabricId,
        templateId: parsed.data.templateId,
      }),
    );
  } catch (error) {
    return fail(describeError(error));
  }
}

const updateDraftOptionsSchema = z.object({
  draftId: z.string().uuid(),
  options: z.record(z.string(), z.string()),
});

export async function updateDraftOptionsAction(
  input: z.infer<typeof updateDraftOptionsSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof updateDraftOptions>>>> {
  const parsed = updateDraftOptionsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();

    const draft = await getDraft(supabase, parsed.data.draftId);
    if (!draft) return fail("Draft not found.");
    if (!draft.fabric_id || !draft.template_id) return fail("Pick a fabric and template first.");

    const fabric = await getFabric(supabase, draft.fabric_id);
    if (!fabric) return fail("Fabric not found.");
    const template = await getTemplate(supabase, draft.template_id);
    if (!template) return fail("Template not found.");

    const evaluated = evaluateOptions(toTemplateOptionInputs(template.options), fabric.supported_options);
    if (!isSelectionSupported(evaluated, parsed.data.options)) {
      return fail("One or more selected options aren't supported by this fabric.");
    }

    return ok(await updateDraftOptions(supabase, parsed.data.draftId, parsed.data.options));
  } catch (error) {
    return fail(describeError(error));
  }
}

const priceDraftSchema = z.object({ draftId: z.string().uuid() });

export async function priceDraftAction(
  input: z.infer<typeof priceDraftSchema>,
): Promise<ActionResult<PriceBreakdown>> {
  const parsed = priceDraftSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const loaded = await loadAndPriceDraft(supabase, parsed.data.draftId);
    if (isActionResult(loaded)) return loaded;

    return ok(loaded.pricing);
  } catch (error) {
    return fail(describeError(error));
  }
}

const takeSoftReservationSchema = z.object({ draftId: z.string().uuid() });

export async function takeSoftReservationAction(
  input: z.infer<typeof takeSoftReservationSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof takeSoftReservation>>>> {
  const parsed = takeSoftReservationSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const loaded = await loadAndPriceDraft(supabase, parsed.data.draftId);
    if (isActionResult(loaded)) return loaded;

    return ok(
      await takeSoftReservation(supabase, {
        draftId: parsed.data.draftId,
        fabricId: loaded.draft.fabric_id as string,
        metres: loaded.yardageMetres,
      }),
    );
  } catch (error) {
    return fail(describeError(error));
  }
}
