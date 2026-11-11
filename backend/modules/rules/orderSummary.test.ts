import { describe, expect, it } from "vitest";
import { DISPATCH_ALLOWANCE_DAYS, estimateLeadDays, resolveSelection } from "./orderSummary";
import type { EvaluatedOptionGroup } from "./types";

const options: EvaluatedOptionGroup[] = [
  {
    groupKey: "neckline",
    groupLabel: "Neckline",
    values: [
      { key: "round-neck", label: "Round Neck", priceDelta: 0, extraLeadDays: 0, isDefault: true },
      { key: "keyhole", label: "Keyhole", priceDelta: 0, extraLeadDays: 0, isDefault: false },
    ],
  },
  {
    groupKey: "finishing-detail",
    groupLabel: "Finishing Detail",
    values: [
      { key: "neck-border", label: "Neck Border", priceDelta: 0, extraLeadDays: 0, isDefault: true },
      { key: "festive-embroidery", label: "Festive Embroidery", priceDelta: 1800, extraLeadDays: 3, isDefault: false },
    ],
  },
];

describe("estimateLeadDays", () => {
  it("adds the dispatch allowance to the template lead time", () => {
    expect(estimateLeadDays(10, options, { neckline: "round-neck" })).toBe(10 + DISPATCH_ALLOWANCE_DAYS);
  });

  it("adds each chosen option's extra lead days", () => {
    expect(estimateLeadDays(10, options, { neckline: "keyhole", "finishing-detail": "festive-embroidery" })).toBe(
      10 + 3 + DISPATCH_ALLOWANCE_DAYS,
    );
  });

  it("rejects a value the fabric/template doesn't offer", () => {
    expect(() => estimateLeadDays(10, options, { neckline: "boat-neck" })).toThrow(/not supported/);
  });
});

describe("resolveSelection", () => {
  it("snapshots each chosen option with its labels and price, in group order", () => {
    expect(resolveSelection(options, { "finishing-detail": "festive-embroidery", neckline: "keyhole" })).toEqual([
      { group: "neckline", group_label: "Neckline", value: "keyhole", label: "Keyhole", price_delta: 0 },
      {
        group: "finishing-detail",
        group_label: "Finishing Detail",
        value: "festive-embroidery",
        label: "Festive Embroidery",
        price_delta: 1800,
      },
    ]);
  });

  it("leaves out groups with no choice", () => {
    expect(resolveSelection(options, { neckline: "round-neck" })).toHaveLength(1);
  });

  it("rejects a value the fabric/template doesn't offer", () => {
    expect(() => resolveSelection(options, { neckline: "boat-neck" })).toThrow(/not supported/);
  });
});
