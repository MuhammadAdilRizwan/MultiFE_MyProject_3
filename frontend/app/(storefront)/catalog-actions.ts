"use server";

import { z } from "zod";
import { getFabric } from "@multife/backend/modules/catalog/getFabric";
import { getTemplate } from "@multife/backend/modules/catalog/getTemplate";
import { listFabrics } from "@multife/backend/modules/catalog/listFabrics";
import { listTemplates } from "@multife/backend/modules/catalog/listTemplates";
import type { FabricImageRow, FabricRow, TemplateOptionRow, TemplateRow } from "@multife/backend/modules/catalog/types";
import { evaluateOptions } from "@multife/backend/modules/rules/evaluateOptions";
import { isTemplateCompatibleWithFabric } from "@multife/backend/modules/rules/isTemplateCompatibleWithFabric";
import type { EvaluatedOptionGroup, TemplateOptionInput } from "@multife/backend/modules/rules/types";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { describeError } from "@/lib/describe-error";
import { createClient } from "@/lib/supabase/server";
import { getActiveBrandBySlug, type ActiveBrand } from "@/lib/suppliers";

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

// What a customer may order from: RLS already hides unavailable fabrics from
// the public, but an admin's or contact's session sees more, so filter here too.
const isOrderable = (fabric: Pick<FabricRow, "is_available" | "is_hidden">) => fabric.is_available && !fabric.is_hidden;

const listStoreFabricsSchema = z.object({ supplierId: z.string().uuid() });

export type StoreFabric = FabricRow & { coverImage: string | null };

// Storefront fabric library: the brand's orderable fabrics, each with its
// first image (fabric_images, by sort order) for the card.
export async function listStoreFabricsAction(
  input: z.infer<typeof listStoreFabricsSchema>,
): Promise<ActionResult<StoreFabric[]>> {
  const parsed = listStoreFabricsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const fabrics = (await listFabrics(supabase, parsed.data)).filter(isOrderable);
    if (fabrics.length === 0) return ok([]);

    const { data: images, error } = await supabase
      .from("fabric_images")
      .select("fabric_id, url, sort")
      .in("fabric_id", fabrics.map((f) => f.id))
      .order("sort");
    if (error) throw error;

    const cover = new Map<string, string>();
    for (const image of (images ?? []) as { fabric_id: string; url: string }[]) {
      if (!cover.has(image.fabric_id)) cover.set(image.fabric_id, image.url);
    }
    return ok(fabrics.map((f) => ({ ...f, coverImage: cover.get(f.id) ?? null })));
  } catch (error) {
    return fail(describeError(error));
  }
}

const getOrderContextSchema = z.object({
  brandSlug: z.string().min(1),
  fabricId: z.string().uuid(),
  templateId: z.string().uuid().nullable().optional(),
});

export type OrderContextData = {
  brand: ActiveBrand;
  fabric: FabricRow & { images: FabricImageRow[] };
  template: TemplateRow | null;
  // The template's options this fabric supports (SDS §5.2) — empty until a template is chosen.
  options: EvaluatedOptionGroup[];
  // A signed-in, active customer gets a database draft (order module); guests
  // and other roles keep the draft in the browser only.
  isCustomer: boolean;
};

// Everything the order screens need for the customer's saved draft, read
// fresh from the database so the browser's copy is never the authority.
// Fails (and the screen sends the customer back to the start) if the brand,
// fabric or template is no longer live, or the fabric isn't from that brand.
export async function getOrderContextAction(
  input: z.infer<typeof getOrderContextSchema>,
): Promise<ActionResult<OrderContextData>> {
  const parsed = getOrderContextSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const brand = await getActiveBrandBySlug(parsed.data.brandSlug);
    if (!brand) return fail("Store not found.");

    const supabase = await createClient();
    const fabric = await getFabric(supabase, parsed.data.fabricId);
    if (!fabric || fabric.supplier_id !== brand.id || !isOrderable(fabric)) return fail("Fabric not found.");

    const actor = await getCurrentProfile(supabase);
    const isCustomer = actor?.role === "customer" && actor.status === "active";

    if (!parsed.data.templateId) return ok({ brand, fabric, template: null, options: [], isCustomer });

    const full = await getTemplate(supabase, parsed.data.templateId);
    if (!full || !full.is_published) return fail("Template not found.");

    const { options: templateOptions, ...template } = full;
    const options = evaluateOptions(toTemplateOptionInputs(templateOptions), fabric.supported_options);
    return ok({ brand, fabric, template, options, isCustomer });
  } catch (error) {
    return fail(describeError(error));
  }
}
