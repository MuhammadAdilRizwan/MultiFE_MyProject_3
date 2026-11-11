// FR-TPL-05 / FR-AI-06: a template declares the measurement fields it needs,
// each with a plausible range. A manual (or adjusted) set is accepted only if
// every required field is present, numeric and inside its range. Extra keys
// are dropped — the order snapshot holds exactly what the template asks for.

export interface MeasurementField {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
}

export type MeasurementValidation =
  | { ok: true; values: Record<string, number> }
  | { ok: false; errors: Record<string, string> };

export function validateMeasurements(
  fields: MeasurementField[],
  input: Record<string, unknown>,
): MeasurementValidation {
  const values: Record<string, number> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const raw = input[field.key];
    const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors[field.key] = `Enter your ${field.label.toLowerCase()}.`;
      continue;
    }
    if (value < field.min || value > field.max) {
      errors[field.key] = `${field.label} must be between ${field.min} and ${field.max} ${field.unit}.`;
      continue;
    }
    values[field.key] = Math.round(value * 10) / 10;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };
}
