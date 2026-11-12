import type { EvaluatedOptionGroup, OptionSelection } from "./types";

// Client rule (2026-11-12): every outfit costs between PKR 10,000 and 20,000.
// The catalogue is priced to land inside this range; these bounds guarantee
// it whatever the size or the style extras chosen.
export const ORDER_PRICE_BOUNDS = { min: 10_000, max: 20_000 } as const;

export interface PriceOrderParams {
  fabricPricePerMetre: number;
  templateBaseStitchPrice: number;
  yardageMetres: number;
  evaluatedOptions: EvaluatedOptionGroup[];
  selection: OptionSelection;
  // Override the bounds (tests), or null for the raw sum.
  bounds?: { min: number; max: number } | null;
}

export interface PriceBreakdown {
  yardageMetres: number;
  fabricCost: number;
  stitchCost: number;
  optionsCost: number;
  // What keeps the total inside the price bounds: positive when the raw sum
  // is below the minimum, negative when it is above the maximum, else 0.
  // fabricCost + stitchCost + optionsCost + adjustment === total.
  adjustment: number;
  total: number;
}

// D4 (two-pass yardage): this prices one pass given its yardage — nominal at
// fabric selection, final once measurements are confirmed. `evaluatedOptions`
// must come from evaluateOptions against the server's own read of the fabric
// and template (never the client), same requirement as isSelectionSupported.
export function priceOrder(params: PriceOrderParams): PriceBreakdown {
  const { fabricPricePerMetre, templateBaseStitchPrice, yardageMetres, evaluatedOptions, selection } = params;
  const bounds = params.bounds === undefined ? ORDER_PRICE_BOUNDS : params.bounds;

  let optionsCost = 0;
  for (const [groupKey, valueKey] of Object.entries(selection)) {
    const value = evaluatedOptions.find((g) => g.groupKey === groupKey)?.values.find((v) => v.key === valueKey);
    if (!value) {
      throw new Error(`Selected value "${valueKey}" for group "${groupKey}" is not supported`);
    }
    optionsCost += value.priceDelta;
  }

  const fabricCost = round2(yardageMetres * fabricPricePerMetre);
  const stitchCost = round2(templateBaseStitchPrice);
  const subtotal = round2(fabricCost + stitchCost + optionsCost);
  const total = bounds ? Math.min(Math.max(subtotal, bounds.min), bounds.max) : subtotal;

  return {
    yardageMetres,
    fabricCost,
    stitchCost,
    optionsCost: round2(optionsCost),
    adjustment: round2(total - subtotal),
    total,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
