import type { SupportedOptions, TemplateOptionInput } from "./types";

// FR-CUS-06: "the custom path presents the template library, filtered to
// templates the chosen fabric's supplied option set supports." A template
// is compatible only if, for every group it offers, the fabric supports at
// least one of the values that group needs — otherwise the customer would
// reach a group they can't fill in.
export function isTemplateCompatibleWithFabric(
  templateOptions: TemplateOptionInput[],
  supportedOptions: SupportedOptions,
): boolean {
  const groupKeys = new Set(templateOptions.map((option) => option.groupKey));

  for (const groupKey of groupKeys) {
    const valuesForGroup = templateOptions.filter((option) => option.groupKey === groupKey);
    const supported = supportedOptions[groupKey] ?? [];
    const hasAnySupportedValue = valuesForGroup.some((option) => supported.includes(option.valueKey));
    if (!hasAnySupportedValue) return false;
  }

  return true;
}
