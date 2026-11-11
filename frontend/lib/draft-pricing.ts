import type { FabricRow, TemplateOptionRow, TemplateRow } from "@multife/backend/modules/catalog/types";
import { getFabric } from "@multife/backend/modules/catalog/getFabric";
import { getTemplate } from "@multife/backend/modules/catalog/getTemplate";
import { getMeasurementProfile } from "@multife/backend/modules/measurements/getMeasurementProfile";
import type { MeasurementProfileRow } from "@multife/backend/modules/measurements/types";
import { getDraft } from "@multife/backend/modules/orders/getDraft";
import type { AnySupabaseClient, OrderDraftRow } from "@multife/backend/modules/orders/types";
import { estimateYardage } from "@multife/backend/modules/rules/estimateYardage";
import { evaluateOptions } from "@multife/backend/modules/rules/evaluateOptions";
import { priceOrder, type PriceBreakdown } from "@multife/backend/modules/rules/priceOrder";
import type { TemplateOptionInput } from "@multife/backend/modules/rules/types";
import { fail, type ActionResult } from "./action-result";
import { nominalMeasurements } from "./catalog";

// Server-side helpers shared by the order and checkout Server Actions. Not a
// "use server" file: nothing here is callable from the browser directly.

export function toTemplateOptionInputs(options: TemplateOptionRow[]): TemplateOptionInput[] {
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

export interface LoadedDraftContext {
  draft: OrderDraftRow;
  fabric: FabricRow;
  template: TemplateRow;
  evaluatedOptions: ReturnType<typeof evaluateOptions>;
  // The draft's confirmed measurement set, or null while it has none.
  profile: MeasurementProfileRow | null;
  yardageMetres: number;
  pricing: PriceBreakdown;
}

// Load the draft's fabric + template, re-evaluate its option set, and price
// it. Never trusts a previously stored price — always recomputed from the
// current catalogue. Two-pass yardage (D9, FR-FAB-16): the template's nominal
// size until the customer has confirmed measurements, then their own.
export async function loadAndPriceDraft(
  supabase: AnySupabaseClient,
  draftId: string,
): Promise<LoadedDraftContext | ActionResult<never>> {
  const draft = await getDraft(supabase, draftId);
  if (!draft) return fail("Draft not found.");
  if (!draft.fabric_id || !draft.template_id) return fail("Pick a fabric and template first.");

  const fabric = await getFabric(supabase, draft.fabric_id);
  if (!fabric) return fail("Fabric not found.");
  const fullTemplate = await getTemplate(supabase, draft.template_id);
  if (!fullTemplate) return fail("Template not found.");
  const { options: templateOptions, ...template } = fullTemplate;

  const evaluatedOptions = evaluateOptions(toTemplateOptionInputs(templateOptions), fabric.supported_options);

  const found = draft.measurement_profile_id ? await getMeasurementProfile(supabase, draft.measurement_profile_id) : null;
  const profile = found?.confirmed_at ? found : null;

  const yardageMetres = estimateYardage({
    yardageFormula: template.yardage_formula,
    measurements: profile ? profile.measurement_values : nominalMeasurements(template.required_measurements),
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

  return { draft, fabric, template, evaluatedOptions, profile, yardageMetres, pricing };
}

export function isActionResult(value: unknown): value is ActionResult<never> {
  return typeof value === "object" && value !== null && "ok" in value;
}
