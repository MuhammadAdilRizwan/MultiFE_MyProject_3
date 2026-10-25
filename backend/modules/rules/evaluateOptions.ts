import type { EvaluatedOptionGroup, SupportedOptions, TemplateOptionInput } from "./types";

// SDS §5.2: "the customization step offers only the listed values" — the
// intersection of what the template offers (template_options) and what the
// fabric's synced feed supports. A group with nothing left in the
// intersection is dropped entirely, not shown empty.
export function evaluateOptions(
  templateOptions: TemplateOptionInput[],
  supportedOptions: SupportedOptions,
): EvaluatedOptionGroup[] {
  const groups = new Map<string, EvaluatedOptionGroup>();

  for (const option of templateOptions) {
    if (!(supportedOptions[option.groupKey] ?? []).includes(option.valueKey)) continue;

    if (!groups.has(option.groupKey)) {
      groups.set(option.groupKey, { groupKey: option.groupKey, groupLabel: option.groupLabel, values: [] });
    }
    groups.get(option.groupKey)!.values.push({
      key: option.valueKey,
      label: option.valueLabel,
      priceDelta: option.priceDelta,
      extraLeadDays: option.extraLeadDays,
      isDefault: option.isDefault,
    });
  }

  return [...groups.values()];
}
