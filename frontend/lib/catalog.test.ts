import { describe, expect, it } from "vitest";
import { estimateFabricMetres, estimateOrderFrom, fabricName, fabricProperties, formatMetres, templateImage } from "./catalog";

const formula = { base_metres: 4.5, coefficients: { chest: 0.015 }, wastage_margin: 0.1 };

describe("estimateFabricMetres", () => {
  it("uses the template's base and margin at nominal size", () => {
    expect(estimateFabricMetres({ yardage_formula: formula }, { properties: {} })).toBe(4.95);
  });

  it("adds the extra margin for a directional-pattern fabric", () => {
    expect(estimateFabricMetres({ yardage_formula: formula }, { properties: { directional_pattern: true } })).toBe(5.175);
  });

  it("returns null when the template has no formula yet", () => {
    expect(estimateFabricMetres({ yardage_formula: {} as never }, { properties: {} })).toBeNull();
  });
});

describe("estimateOrderFrom", () => {
  it("is fabric plus base stitching, with no template option extras", () => {
    const estimate = estimateOrderFrom(
      { yardage_formula: formula, base_stitch_price: 2500 },
      { properties: {}, price_per_metre: 900 },
    );

    expect(estimate).toEqual({ metres: 4.95, total: 6955 });
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
