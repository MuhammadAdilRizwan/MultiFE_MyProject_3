import type { EvaluatedOptionGroup, OptionSelection } from "./types";

export interface PriceOrderParams {
  fabricPricePerMetre: number;
  templateBaseStitchPrice: number;
  yardageMetres: number;
  evaluatedOptions: EvaluatedOptionGroup[];
  selection: OptionSelection;
}

export interface PriceBreakdown {
  yardageMetres: number;
  fabricCost: number;
  stitchCost: number;
  optionsCost: number;
  total: number;
}

// D4 (two-pass yardage): this prices one pass given its yardage — nominal at
// fabric selection, final once measurements are confirmed. `evaluatedOptions`
// must come from evaluateOptions against the server's own read of the fabric
// and template (never the client), same requirement as isSelectionSupported.
export function priceOrder(params: PriceOrderParams): PriceBreakdown {
  const { fabricPricePerMetre, templateBaseStitchPrice, yardageMetres, evaluatedOptions, selection } = params;

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

  return {
    yardageMetres,
    fabricCost,
    stitchCost,
    optionsCost: round2(optionsCost),
    total: round2(fabricCost + stitchCost + optionsCost),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
