"use server";

import { z } from "zod";
import { getFabric } from "@multife/backend/modules/catalog/getFabric";
import { getTemplate } from "@multife/backend/modules/catalog/getTemplate";
import { listFabrics } from "@multife/backend/modules/catalog/listFabrics";
import { listTemplates } from "@multife/backend/modules/catalog/listTemplates";
import type { TemplateOptionRow } from "@multife/backend/modules/catalog/types";
import { evaluateOptions } from "@multife/backend/modules/rules/evaluateOptions";
import { isTemplateCompatibleWithFabric } from "@multife/backend/modules/rules/isTemplateCompatibleWithFabric";
import type { TemplateOptionInput } from "@multife/backend/modules/rules/types";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { describeError } from "@/lib/describe-error";
import { createClient } from "@/lib/supabase/server";

// Public, read-only: RLS already scopes what's visible to a guest/customer.
// Every action here just shapes a query or composes two already-tested
// backend modules (catalog + rules) — no business logic of its own.

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

const listFabricsSchema = z.object({ supplierId: z.string().uuid().optional() });

export async function listFabricsAction(
  input: z.infer<typeof listFabricsSchema> = {},
): Promise<ActionResult<Awaited<ReturnType<typeof listFabrics>>>> {
  const parsed = listFabricsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const fabrics = await listFabrics(supabase, parsed.data);
    return ok(fabrics);
  } catch (error) {
    return fail(describeError(error));
  }
}

const getFabricSchema = z.object({ fabricId: z.string().uuid() });

export async function getFabricAction(
  input: z.infer<typeof getFabricSchema>,
): Promise<ActionResult<NonNullable<Awaited<ReturnType<typeof getFabric>>>>> {
  const parsed = getFabricSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const fabric = await getFabric(supabase, parsed.data.fabricId);
    if (!fabric) return fail("Fabric not found.");
    return ok(fabric);
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function listTemplatesAction(): Promise<ActionResult<Awaited<ReturnType<typeof listTemplates>>>> {
  try {
    const supabase = await createClient();
    const templates = await listTemplates(supabase);
    return ok(templates);
  } catch (error) {
    return fail(describeError(error));
  }
}

const getTemplateSchema = z.object({ templateId: z.string().uuid() });

export async function getTemplateAction(
  input: z.infer<typeof getTemplateSchema>,
): Promise<ActionResult<NonNullable<Awaited<ReturnType<typeof getTemplate>>>>> {
  const parsed = getTemplateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const template = await getTemplate(supabase, parsed.data.templateId);
    if (!template) return fail("Template not found.");
    return ok(template);
  } catch (error) {
    return fail(describeError(error));
  }
}

const getTemplateOptionsForFabricSchema = z.object({
  templateId: z.string().uuid(),
  fabricId: z.string().uuid(),
});

// SDS §5.2 "customization step" check: offers only the options both the
// template and the chosen fabric support.
export async function getTemplateOptionsForFabricAction(
  input: z.infer<typeof getTemplateOptionsForFabricSchema>,
): Promise<ActionResult<{ templateId: string; fabricId: string; options: ReturnType<typeof evaluateOptions> }>> {
  const parsed = getTemplateOptionsForFabricSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const template = await getTemplate(supabase, parsed.data.templateId);
    if (!template) return fail("Template not found.");

    const fabric = await getFabric(supabase, parsed.data.fabricId);
    if (!fabric) return fail("Fabric not found.");

    const options = evaluateOptions(toTemplateOptionInputs(template.options), fabric.supported_options);
    return ok({ templateId: template.id, fabricId: fabric.id, options });
  } catch (error) {
    return fail(describeError(error));
  }
}

const listCompatibleTemplatesForFabricSchema = z.object({ fabricId: z.string().uuid() });

// FR-CUS-06 template-library filter: only templates the fabric can actually
// be made up in.
export async function listCompatibleTemplatesForFabricAction(
  input: z.infer<typeof listCompatibleTemplatesForFabricSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof listTemplates>>>> {
  const parsed = listCompatibleTemplatesForFabricSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const fabric = await getFabric(supabase, parsed.data.fabricId);
    if (!fabric) return fail("Fabric not found.");

    const templates = await listTemplates(supabase);
    const compatible = [];
    for (const summary of templates) {
      const full = await getTemplate(supabase, summary.id);
      if (!full) continue;
      if (isTemplateCompatibleWithFabric(toTemplateOptionInputs(full.options), fabric.supported_options)) {
        compatible.push(summary);
      }
    }
    return ok(compatible);
  } catch (error) {
    return fail(describeError(error));
  }
}
