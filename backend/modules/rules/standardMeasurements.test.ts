import { describe, expect, it } from "vitest";
import { TEMPLATES } from "../../scripts/demo-catalog.mjs";
import { CORE_MEASUREMENT_KEYS, STANDARD_MEASUREMENTS } from "./standardMeasurements";

describe("STANDARD_MEASUREMENTS", () => {
  it("covers every demo template field with the same range, so visit measurements prefill orders", () => {
    for (const template of TEMPLATES as Array<{ slug: string; measurements: Array<{ key: string; min: number; max: number }> }>) {
      for (const field of template.measurements) {
        const standard = STANDARD_MEASUREMENTS.find((f) => f.key === field.key);
        expect(standard, `${template.slug}.${field.key}`).toBeDefined();
        expect([standard!.min, standard!.max]).toEqual([field.min, field.max]);
      }
    }
  });

  it("has unique keys, and the core keys are all in it", () => {
    const keys = STANDARD_MEASUREMENTS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of CORE_MEASUREMENT_KEYS) expect(keys).toContain(key);
  });
});
