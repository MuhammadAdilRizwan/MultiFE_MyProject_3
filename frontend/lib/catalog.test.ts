import { describe, expect, it } from "vitest";
import {
  estimateFabricMetres,
  estimateOrderFrom,
  fabricName,
  fabricProperties,
  formatMetres,
  nominalMeasurements,
  templateImage,
} from "./catalog";

const formula = { base_metres: 4.5, coefficients: { chest: 0.015 }, wastage_margin: 0.1 };
const required_measurements = [{ key: "chest", label: "Chest", unit: "cm", min: 60, max: 160 }];

describe("nominalMeasurements", () => {
  it("uses the midpoint of each field's range", () => {
    expect(nominalMeasurements(required_measurements)).toEqual({ chest: 110 });
    expect(nominalMeasurements(undefined)).toEqual({});
  });
});

describe("estimateFabricMetres", () => {
  it("applies the template formula at the nominal size", () => {
    // (4.5 + 0.015 × 110) × 1.1
    expect(estimateFabricMetres({ yardage_formula: formula, required_measurements }, { properties: {} })).toBe(6.765);
  });

  it("adds the extra margin for a directional-pattern fabric", () => {
    expect(
      estimateFabricMetres({ yardage_formula: formula, required_measurements }, { properties: { directional_pattern: true } }),
    ).toBe(7.073);
  });

  it("returns null when the template has no formula yet", () => {
    expect(estimateFabricMetres({ yardage_formula: {} as never, required_measurements }, { properties: {} })).toBeNull();
  });
});

describe("estimateOrderFrom", () => {
  const template = { yardage_formula: formula, required_measurements, base_stitch_price: 2500 };
  const fabric = { properties: {}, price_per_metre: 900 };
  const offered = [
    {
      groupKey: "closure",
      groupLabel: "Closure",
      values: [
        { key: "buttons", label: "Buttons", priceDelta: 0, extraLeadDays: 0, isDefault: true },
        { key: "zip", label: "Zip", priceDelta: 300, extraLeadDays: 0, isDefault: false },
      ],
    },
  ];

  it("is fabric plus base stitching when nothing extra is chosen", () => {
    expect(estimateOrderFrom(template, fabric)).toEqual({
      yardageMetres: 6.765,
      fabricCost: 6088.5,
      stitchCost: 2500,
      optionsCost: 0,
      total: 8588.5,
    });
  });

  it("adds the extra price of the chosen options", () => {
    expect(estimateOrderFrom(template, fabric, offered, { closure: "zip" })).toMatchObject({ optionsCost: 300, total: 8888.5 });
  });
});

describe("fabricProperties", () => {
  it("lists the known text properties in order, capitalised, skipping blanks", () => {
    expect(
      fabricProperties({ properties: { drape: "fluid", fibre: "silk", weight: " ", directional_pattern: false } }),
    ).toEqual([
      { key: "fibre", label: "Fibre", value: "Silk" },
      { key: "drape", label: "Drape", value: "Fluid" },
    ]);
  });
});

describe("display helpers", () => {
  it("prefers the admin display name", () => {
    expect(fabricName({ name: "KH-SLK-114", display_name: "Raw silk" })).toBe("Raw silk");
    expect(fabricName({ name: "Raw silk, ivory", display_name: null })).toBe("Raw silk, ivory");
  });

  it("formats metres", () => {
    expect(formatMetres(1)).toBe("1 metre");
    expect(formatMetres(4.95)).toBe("4.95 metres");
  });

  it("finds a template picture only by exact slug", () => {
    expect(templateImage("long-kurti")).toBe("/templates/long-kurti.webp");
    expect(templateImage("kurti")).toBeNull();
  });
});
