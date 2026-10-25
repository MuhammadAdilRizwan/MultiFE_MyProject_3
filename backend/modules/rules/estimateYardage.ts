import type { OptionSelection, YardageFormula } from "./types";

// Placeholder — SDS §6.2 says a directional-pattern/nap fabric "raises the
// margin" but gives no figure. Flagged for a real business number before
// this is relied on for pricing.
export const DIRECTIONAL_PATTERN_MARGIN_BONUS = 0.05;

export interface EstimateYardageParams {
  yardageFormula: YardageFormula;
  // Keyed by the template's required_measurements field key, in cm. Pass the
  // template's nominal/default size for the first pass (fabric selection),
  // the customer's confirmed measurements for the second (D9) — the formula
  // itself doesn't change between passes, only which measurements it's given.
  measurements: Record<string, number>;
  selection: OptionSelection;
  fabricHasDirectionalPattern: boolean;
}

// D9 / SDS §6.2: base consumption, plus a per-measurement coefficient
// (multiplied by that measurement's value) or a flat per-option allowance
// (added once if that value is selected) for every coefficient key, then
// the wastage margin applied to the whole total.
export function estimateYardage(params: EstimateYardageParams): number {
  const { yardageFormula, measurements, selection, fabricHasDirectionalPattern } = params;
  const selectedValueKeys = new Set(Object.values(selection));

  let consumption = yardageFormula.base_metres;
  for (const [key, coefficient] of Object.entries(yardageFormula.coefficients)) {
    if (Object.prototype.hasOwnProperty.call(measurements, key)) {
      consumption += coefficient * measurements[key];
    } else if (selectedValueKeys.has(key)) {
      consumption += coefficient;
    }
  }

  const margin = yardageFormula.wastage_margin + (fabricHasDirectionalPattern ? DIRECTIONAL_PATTERN_MARGIN_BONUS : 0);

  return round3(consumption * (1 + margin));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
