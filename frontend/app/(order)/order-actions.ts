"use server";

import { z } from "zod";
import { getFabric } from "@multife/backend/modules/catalog/getFabric";
import { getTemplate } from "@multife/backend/modules/catalog/getTemplate";
import { getCurrentAgent } from "@multife/backend/modules/agents/getCurrentAgent";
import { getMyCustomer } from "@multife/backend/modules/agents/getMyCustomer";
import { createDraft } from "@multife/backend/modules/orders/createDraft";
import { getDraft } from "@multife/backend/modules/orders/getDraft";
import { takeSoftReservation } from "@multife/backend/modules/orders/takeSoftReservation";
import { updateDraftOptions } from "@multife/backend/modules/orders/updateDraftOptions";
import { evaluateOptions } from "@multife/backend/modules/rules/evaluateOptions";
import type { PriceBreakdown } from "@multife/backend/modules/rules/priceOrder";
import { isSelectionSupported } from "@multife/backend/modules/rules/isSelectionSupported";
import { isTemplateCompatibleWithFabric } from "@multife/backend/modules/rules/isTemplateCompatibleWithFabric";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { describeError } from "@/lib/describe-error";
import { isActionResult, loadAndPriceDraft, toTemplateOptionInputs } from "@/lib/draft-pricing";
import { createClient } from "@/lib/supabase/server";

// Composes already-tested backend modules (catalog + rules + orders) — no
// business logic of its own, same convention as (storefront)/catalog-actions.ts.

const createDraftSchema = z.object({
  fabricId: z.string().uuid(),
  templateId: z.string().uuid(),
  // An agent ordering for one of their customers (FR-AGT-03).
  customerId: z.string().uuid().optional(),
});

export async function createDraftAction(
  input: z.infer<typeof createDraftSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof createDraft>>>> {
  const parsed = createDraftSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();

    const actor = await getCurrentProfile(supabase);
    const isAgent = actor?.role === "agent" && actor.status === "active";
    if (!actor || actor.status !== "active" || (actor.role !== "customer" && !isAgent)) {
      return fail("Sign in as a customer to start an order.");
    }

    // Who the order is for: the customer themselves, or an agent's assigned customer.
    let customerId = actor.id;
    if (isAgent) {
      if (!parsed.data.customerId) return fail("Choose the customer you're ordering for in your agent panel.");
      const agent = await getCurrentAgent(supabase);
      if (!agent || agent.status !== "active") return fail("Your agent account isn't active.");
      const customer = await getMyCustomer(supabase, agent.id, parsed.data.customerId);
      if (!customer) return fail("This customer isn't assigned to you.");
      customerId = customer.customerId;
    } else if (parsed.data.customerId && parsed.data.customerId !== actor.id) {
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
        customerId,
        fabricId: parsed.data.fabricId,
        templateId: parsed.data.templateId,
        ...(isAgent ? { agentId: actor.id } : {}),
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
