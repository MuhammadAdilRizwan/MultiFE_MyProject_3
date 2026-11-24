import { describe, expect, it } from "vitest";
import { fabricFit, templateFit } from "./fabric-fit";

const formula = { base_metres: 4.5, coefficients: { chest: 0.015 }, wastage_margin: 0.1 };
const required_measurements = [{ key: "chest", label: "Chest", unit: "cm", min: 60, max: 160 }];
const template = { id: "t1", yardage_formula: formula, required_measurements };
const fabric = { properties: {} };

describe("templateFit", () => {
  it("is enough when what's left covers the outfit at the standard size", () => {
    // (4.5 + 0.015 × 110) × 1.1 = 6.765
    expect(templateFit(template, fabric, 6.765)).toEqual({ requiredMetres: 6.765, enough: true });
    expect(templateFit(template, fabric, 6.7)).toEqual({ requiredMetres: 6.765, enough: false });
  });

  it("uses the customer's own size when given", () => {
    expect(templateFit(template, fabric, 6.5, { chest: 90 })).toEqual({ requiredMetres: 6.435, enough: true });
  });

  it("counts the directional-pattern margin", () => {
    expect(templateFit(template, { properties: { directional_pattern: true } }, 7)).toEqual({ requiredMetres: 7.073, enough: false });
  });

  it("without a formula, only needs some fabric left", () => {
    const noFormula = { yardage_formula: {} as never, required_measurements };
    expect(templateFit(noFormula, fabric, 0.5)).toEqual({ requiredMetres: null, enough: true });
    expect(templateFit(noFormula, fabric, 0)).toEqual({ requiredMetres: null, enough: false });
  });
});

describe("fabricFit", () => {
  it("keys fits by template and says whose size", () => {
    expect(fabricFit([template], fabric, 10)).toEqual({
      availableMetres: 10,
      basis: "standard",
      fits: { t1: { requiredMetres: 6.765, enough: true } },
    });
    expect(fabricFit([template], fabric, 10, { chest: 90 }).basis).toBe("saved");
    expect(fabricFit([template], fabric, 10, {}).basis).toBe("standard");
  });
});
