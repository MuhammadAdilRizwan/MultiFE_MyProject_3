import { describe, expect, it } from "vitest";
import { ORDER_PRICE_BOUNDS, priceOrder } from "./priceOrder";
import type { EvaluatedOptionGroup } from "./types";

const evaluatedOptions: EvaluatedOptionGroup[] = [
  {
    groupKey: "sleeve",
    groupLabel: "Sleeve",
    values: [
      { key: "full", label: "Full", priceDelta: 0, extraLeadDays: 0, isDefault: true },
      { key: "three-quarter", label: "Three-quarter", priceDelta: 150, extraLeadDays: 1, isDefault: false },
    ],
  },
  {
    groupKey: "closure",
    groupLabel: "Closure",
    values: [{ key: "zip", label: "Zip", priceDelta: 200, extraLeadDays: 0, isDefault: false }],
  },
];

describe("priceOrder", () => {
  it("prices fabric by yardage * price per metre, with no options selected", () => {
    const result = priceOrder({
      fabricPricePerMetre: 900,
      templateBaseStitchPrice: 2500,
      yardageMetres: 4.5,
      evaluatedOptions,
      selection: {},
      bounds: null,
    });

    expect(result).toEqual({
      yardageMetres: 4.5,
      fabricCost: 4050,
      stitchCost: 2500,
      optionsCost: 0,
      adjustment: 0,
      total: 6550,
    });
  });

  it("sums the price delta of every selected value", () => {
    const result = priceOrder({
      fabricPricePerMetre: 900,
      templateBaseStitchPrice: 2500,
      yardageMetres: 4.5,
      evaluatedOptions,
      selection: { sleeve: "three-quarter", closure: "zip" },
      bounds: null,
    });

    expect(result.optionsCost).toBe(350);
    expect(result.total).toBe(4050 + 2500 + 350);
  });

  it("throws when a selected value isn't in the evaluated options", () => {
    expect(() =>
      priceOrder({
        fabricPricePerMetre: 900,
        templateBaseStitchPrice: 2500,
        yardageMetres: 4.5,
        evaluatedOptions,
        selection: { sleeve: "sleeveless" },
      }),
    ).toThrow(/sleeveless/);
  });

  it("throws when the selected group isn't in the evaluated options at all", () => {
    expect(() =>
      priceOrder({
        fabricPricePerMetre: 900,
        templateBaseStitchPrice: 2500,
        yardageMetres: 4.5,
        evaluatedOptions,
        selection: { cuff: "soft" },
      }),
    ).toThrow(/cuff/);
  });

  it("rounds every money figure to 2 decimal places", () => {
    const result = priceOrder({
      fabricPricePerMetre: 1200.555,
      templateBaseStitchPrice: 1000,
      yardageMetres: 2.333,
      evaluatedOptions: [],
      selection: {},
      bounds: null,
    });

    expect(result.fabricCost).toBe(2800.89);
    expect(result.total).toBe(3800.89);
  });

  describe("price bounds (PKR 10,000 – 20,000 per outfit)", () => {
    const price = (fabricPricePerMetre: number, yardageMetres: number, stitch: number) =>
      priceOrder({ fabricPricePerMetre, templateBaseStitchPrice: stitch, yardageMetres, evaluatedOptions, selection: {} });

    it("are 10,000 and 20,000", () => {
      expect(ORDER_PRICE_BOUNDS).toEqual({ min: 10000, max: 20000 });
    });

    it("leave a price already inside the range alone", () => {
      expect(price(1000, 5, 7000)).toMatchObject({ adjustment: 0, total: 12000 });
    });

    it("raise a price below the minimum, showing the difference", () => {
      expect(price(900, 4.5, 2500)).toMatchObject({ fabricCost: 4050, stitchCost: 2500, adjustment: 3450, total: 10000 });
    });

    it("cap a price above the maximum, showing the difference", () => {
      expect(price(3000, 8, 6000)).toMatchObject({ fabricCost: 24000, stitchCost: 6000, adjustment: -10000, total: 20000 });
    });

    it("always add up: fabric + stitching + extras + adjustment = total", () => {
      for (const [p, y, st] of [[700, 2.9, 7700], [1700, 7.7, 4700], [3600, 9, 9000], [100, 1, 100]]) {
        const r = price(p, y, st);
        expect(Math.round((r.fabricCost + r.stitchCost + r.optionsCost + r.adjustment) * 100) / 100).toBe(r.total);
        expect(r.total).toBeGreaterThanOrEqual(10000);
        expect(r.total).toBeLessThanOrEqual(20000);
      }
    });
  });
});
