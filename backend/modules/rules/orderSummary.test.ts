import { describe, expect, it } from "vitest";
import { DELIVERY_DAYS, resolveSelection } from "./orderSummary";
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

describe("DELIVERY_DAYS", () => {
  it("is 14 days for every outfit", () => {
    expect(DELIVERY_DAYS).toBe(14);
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
