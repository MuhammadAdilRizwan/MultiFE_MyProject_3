import type { EvaluatedOptionGroup, OptionSelection } from "./types";

// Every outfit is delivered DELIVERY_DAYS after the order is placed
// (client decision, 2026-11-11) — the same for every template and option,
// so per-template and per-option lead times don't change the promise.
export const DELIVERY_DAYS = 14;

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
