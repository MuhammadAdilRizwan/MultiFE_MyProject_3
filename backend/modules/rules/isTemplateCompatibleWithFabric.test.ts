import { describe, expect, it } from "vitest";
import { isTemplateCompatibleWithFabric } from "./isTemplateCompatibleWithFabric";
import type { TemplateOptionInput } from "./types";

const cuffSoft: TemplateOptionInput = {
  groupKey: "cuff",
  groupLabel: "Cuff",
  valueKey: "soft",
  valueLabel: "Soft",
  priceDelta: 0,
  extraLeadDays: 0,
  isDefault: true,
};
const cuffHard: TemplateOptionInput = { ...cuffSoft, valueKey: "hard", valueLabel: "Hard", isDefault: false };
const necklineRound: TemplateOptionInput = {
  groupKey: "neckline",
  groupLabel: "Neckline",
  valueKey: "round",
  valueLabel: "Round",
  priceDelta: 0,
  extraLeadDays: 0,
  isDefault: true,
};

describe("isTemplateCompatibleWithFabric", () => {
  it("FR-CUS-06: is compatible when the fabric supports at least one value per group the template offers", () => {
    expect(isTemplateCompatibleWithFabric([cuffSoft, cuffHard, necklineRound], { cuff: ["soft"], neckline: ["round"] })).toBe(
      true,
    );
  });

  it("is incompatible when one of the template's groups has no supported value at all", () => {
    // the template offers a cuff choice, but the fabric's feed supports neither value
    expect(isTemplateCompatibleWithFabric([cuffSoft, cuffHard, necklineRound], { cuff: [], neckline: ["round"] })).toBe(
      false,
    );
  });

  it("is incompatible when the fabric's feed doesn't mention one of the template's groups at all", () => {
    expect(isTemplateCompatibleWithFabric([cuffSoft, necklineRound], { cuff: ["soft"] })).toBe(false);
  });

  it("is compatible with a template that has no options at all (nothing to fail)", () => {
    expect(isTemplateCompatibleWithFabric([], { cuff: ["soft"] })).toBe(true);
  });
});
