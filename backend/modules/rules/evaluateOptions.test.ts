import { describe, expect, it } from "vitest";
import { evaluateOptions } from "./evaluateOptions";
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
const cuffHard: TemplateOptionInput = {
  groupKey: "cuff",
  groupLabel: "Cuff",
  valueKey: "hard",
  valueLabel: "Hard",
  priceDelta: 300,
  extraLeadDays: 1,
  isDefault: false,
};
const necklineRound: TemplateOptionInput = {
  groupKey: "neckline",
  groupLabel: "Neckline",
  valueKey: "round",
  valueLabel: "Round",
  priceDelta: 0,
  extraLeadDays: 0,
  isDefault: true,
};

describe("evaluateOptions", () => {
  it("offers only the template options the fabric also supports", () => {
    const result = evaluateOptions([cuffSoft, cuffHard, necklineRound], {
      cuff: ["soft"], // the fabric's feed doesn't list a hard cuff (SDS §5.1 example)
      neckline: ["round", "v"],
    });

    const cuffGroup = result.find((g) => g.groupKey === "cuff");
    expect(cuffGroup?.values.map((v) => v.key)).toEqual(["soft"]);
  });

  it("drops a group entirely when the fabric supports none of the template's values for it", () => {
    const result = evaluateOptions([cuffHard], { cuff: ["soft"] });

    expect(result).toEqual([]);
  });

  it("drops a group the fabric's feed doesn't mention at all", () => {
    const result = evaluateOptions([necklineRound], { cuff: ["soft"] });

    expect(result).toEqual([]);
  });

  it("carries the price, lead time and default flag through unchanged", () => {
    const result = evaluateOptions([cuffHard], { cuff: ["hard"] });

    expect(result[0].values[0]).toEqual({
      key: "hard",
      label: "Hard",
      priceDelta: 300,
      extraLeadDays: 1,
      isDefault: false,
    });
  });

  it("returns an empty list for a template with no options at all", () => {
    expect(evaluateOptions([], { cuff: ["soft"] })).toEqual([]);
  });
});
