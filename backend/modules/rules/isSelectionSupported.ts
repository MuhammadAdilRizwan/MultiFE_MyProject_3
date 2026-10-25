import type { EvaluatedOptionGroup, OptionSelection } from "./types";

// SDS §5.2: "the placement path re-checks the submitted selection against
// the stored set before payment, because the browser's copy is not
// authority." `evaluated` must come from evaluateOptions against the
// server's own read of the fabric and template — never from the client.
export function isSelectionSupported(evaluated: EvaluatedOptionGroup[], selection: OptionSelection): boolean {
  return Object.entries(selection).every(([groupKey, valueKey]) => {
    const group = evaluated.find((g) => g.groupKey === groupKey);
    return group?.values.some((v) => v.key === valueKey) ?? false;
  });
}
