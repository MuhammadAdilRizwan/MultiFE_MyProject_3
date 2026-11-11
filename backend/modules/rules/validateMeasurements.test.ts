import { describe, expect, it } from "vitest";
import { validateMeasurements, type MeasurementField } from "./validateMeasurements";

const fields: MeasurementField[] = [
  { key: "chest", label: "Chest", unit: "cm", min: 75, max: 135 },
  { key: "waist", label: "Waist", unit: "cm", min: 60, max: 125 },
];

describe("validateMeasurements", () => {
  it("accepts in-range numbers and numeric strings, rounded to 0.1 cm", () => {
    expect(validateMeasurements(fields, { chest: 96.44, waist: "80" })).toEqual({
      ok: true,
      values: { chest: 96.4, waist: 80 },
    });
  });

  it("accepts values exactly on the range limits", () => {
    expect(validateMeasurements(fields, { chest: 75, waist: 125 }).ok).toBe(true);
  });

  it("reports a missing or non-numeric field", () => {
    const result = validateMeasurements(fields, { chest: "abc" });
    expect(result).toEqual({
      ok: false,
      errors: { chest: "Enter your chest.", waist: "Enter your waist." },
    });
  });

  it("reports an out-of-range field with the allowed range", () => {
    const result = validateMeasurements(fields, { chest: 200, waist: 80 });
    expect(result).toEqual({ ok: false, errors: { chest: "Chest must be between 75 and 135 cm." } });
  });

  it("drops keys the template doesn't ask for", () => {
    expect(validateMeasurements(fields, { chest: 90, waist: 70, shoe: 40 })).toEqual({
      ok: true,
      values: { chest: 90, waist: 70 },
    });
  });

  it("treats an empty string as missing, not zero", () => {
    expect(validateMeasurements(fields, { chest: "", waist: 70 }).ok).toBe(false);
  });
});
