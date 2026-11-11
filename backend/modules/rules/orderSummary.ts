import type { EvaluatedOptionGroup, OptionSelection } from "./types";

// Days between handing a finished garment to dispatch and delivery
// (FR-ORD-11 "dispatch allowance"). Placeholder until the courier is chosen
// (SRS §3 Q4).
export const DISPATCH_ALLOWANCE_DAYS = 3;

// FR-ORD-11: estimated delivery = template lead time + the extra lead time
// of every chosen option + the dispatch allowance. `evaluatedOptions` must be
// the server's own evaluateOptions output, same rule as priceOrder.
export function estimateLeadDays(
  templateLeadDays: number,
  evaluatedOptions: EvaluatedOptionGroup[],
  selection: OptionSelection,
): number {
  let days = templateLeadDays + DISPATCH_ALLOWANCE_DAYS;
  for (const [groupKey, valueKey] of Object.entries(selection)) {
    const value = evaluatedOptions.find((g) => g.groupKey === groupKey)?.values.find((v) => v.key === valueKey);
    if (!value) throw new Error(`Selected value "${valueKey}" for group "${groupKey}" is not supported`);
    days += value.extraLeadDays;
  }
  return days;
}

export interface ResolvedOption {
  group: string;
  group_label: string;
  value: string;
  label: string;
  price_delta: number;
}

// FR-ORD-05: the order keeps a snapshot of every chosen option with its label
// and price, so later catalogue edits don't change what was ordered. Shape
// matches order_items.options ([{ group, value, label, price_delta }]).
export function resolveSelection(
  evaluatedOptions: EvaluatedOptionGroup[],
  selection: OptionSelection,
): ResolvedOption[] {
  return evaluatedOptions.flatMap((group) => {
    const valueKey = selection[group.groupKey];
    if (valueKey === undefined) return [];
    const value = group.values.find((v) => v.key === valueKey);
    if (!value) throw new Error(`Selected value "${valueKey}" for group "${group.groupKey}" is not supported`);
    return [{ group: group.groupKey, group_label: group.groupLabel, value: value.key, label: value.label, price_delta: value.priceDelta }];
  });
}
