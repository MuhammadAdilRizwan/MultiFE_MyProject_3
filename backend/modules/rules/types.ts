// Framework-free, isomorphic: no Supabase client, no Next.js — runs the same
// in the browser and on the server (architecture rule D3/D4). Inputs are
// plain data already read elsewhere (catalog module on the server, a
// client-side fetch in the browser).

// fabrics.supported_options jsonb — { "<group_key>": ["<value_key>", ...] }
export type SupportedOptions = Record<string, string[]>;

// A single template_options row, joined with its group/value labels — the
// shape catalog.getTemplate already returns per option.
export interface TemplateOptionInput {
  groupKey: string;
  groupLabel: string;
  valueKey: string;
  valueLabel: string;
  priceDelta: number;
  extraLeadDays: number;
  isDefault: boolean;
}

export interface EvaluatedOptionValue {
  key: string;
  label: string;
  priceDelta: number;
  extraLeadDays: number;
  isDefault: boolean;
}

export interface EvaluatedOptionGroup {
  groupKey: string;
  groupLabel: string;
  values: EvaluatedOptionValue[];
}

// A customer's (or a submitted order's) chosen value per group —
// { "<group_key>": "<value_key>" }
export type OptionSelection = Record<string, string>;

// dress_templates.yardage_formula jsonb — D9, SDS §6.2
export interface YardageFormula {
  base_metres: number;
  coefficients: Record<string, number>;
  wastage_margin: number;
}
