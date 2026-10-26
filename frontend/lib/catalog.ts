import type { FabricRow, TemplateRow } from "@multife/backend/modules/catalog/types";
import { estimateYardage } from "@multife/backend/modules/rules/estimateYardage";
import { priceOrder, type PriceBreakdown } from "@multife/backend/modules/rules/priceOrder";
import type { EvaluatedOptionGroup, OptionSelection } from "@multife/backend/modules/rules/types";

// Display helpers for the live catalogue (catalog module rows). Isomorphic:
// used by server pages and client order screens alike.

export function formatPKR(amount: number): string {
  return `PKR ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(amount)}`;
}

export function formatMetres(m: number): string {
  const n = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(m);
  return `${n} ${m === 1 ? "metre" : "metres"}`;
}

export const fabricName = (fabric: Pick<FabricRow, "name" | "display_name">) => fabric.display_name || fabric.name;

// fabrics.properties keys the storefront shows, in this order (SDS §4 fabric
// properties). Anything else in the feed is kept but not displayed.
const PROPERTY_LABELS: [key: string, label: string][] = [
  ["fibre", "Fibre"],
  ["weight", "Weight"],
  ["drape", "Drape"],
  ["stretch", "Stretch"],
  ["opacity", "Opacity"],
];

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function fabricProperties(fabric: Pick<FabricRow, "properties">): { key: string; label: string; value: string }[] {
  return PROPERTY_LABELS.flatMap(([key, label]) => {
    const value = fabric.properties[key];
    return typeof value === "string" && value.trim() ? [{ key, label, value: capitalise(value.trim()) }] : [];
  });
}

const hasDirectionalPattern = (fabric: Pick<FabricRow, "properties">) => fabric.properties.directional_pattern === true;

// D9/SDS §6.2 first yardage pass wants the template's nominal size; the schema
// only has min/max per field, so the midpoint stands in (same placeholder the
// order module uses server-side, so both price the same way).
export function nominalMeasurements(
  requiredMeasurements: Array<{ key: string; min: number; max: number }> | null | undefined,
): Record<string, number> {
  const measurements: Record<string, number> = {};
  for (const field of requiredMeasurements ?? []) {
    measurements[field.key] = (field.min + field.max) / 2;
  }
  return measurements;
}

// First-pass yardage at nominal size, before the customer's measurements
// exist — so this is a "from" figure. Null when the template has no usable
// formula yet.
export function estimateFabricMetres(
  template: Pick<TemplateRow, "yardage_formula" | "required_measurements">,
  fabric: Pick<FabricRow, "properties">,
  selection: OptionSelection = {},
): number | null {
  const formula = template.yardage_formula;
  if (!formula || typeof formula.base_metres !== "number") return null;
  return estimateYardage({
    yardageFormula: { base_metres: formula.base_metres, coefficients: formula.coefficients ?? {}, wastage_margin: formula.wastage_margin ?? 0 },
    measurements: nominalMeasurements(template.required_measurements),
    selection,
    fabricHasDirectionalPattern: hasDirectionalPattern(fabric),
  });
}

// The order module's priceOrder (fabric + base stitching + the extras of the
// chosen options), computed in the browser for guests and for "from" prices.
// A signed-in customer's review uses the server's priceDraftAction instead.
// `selection` must only hold values present in `offered`.
export function estimateOrderFrom(
  template: Pick<TemplateRow, "yardage_formula" | "required_measurements" | "base_stitch_price">,
  fabric: Pick<FabricRow, "properties" | "price_per_metre">,
  offered: EvaluatedOptionGroup[] = [],
  selection: OptionSelection = {},
): PriceBreakdown | null {
  const metres = estimateFabricMetres(template, fabric, selection);
  if (metres === null) return null;
  return priceOrder({
    fabricPricePerMetre: fabric.price_per_metre,
    templateBaseStitchPrice: template.base_stitch_price,
    yardageMetres: metres,
    evaluatedOptions: offered,
    selection,
  });
}

// The client's own template photos in /public/templates, used until templates
// carry an image in the database. Matched by template slug only.
const TEMPLATE_IMAGES = new Set(["2-piece-suit", "3-piece-suit", "a-line-frock", "abaya", "long-kurti", "maxi-dress", "peplum-set"]);

export const templateImage = (slug: string) => (TEMPLATE_IMAGES.has(slug) ? `/templates/${slug}.webp` : null);
