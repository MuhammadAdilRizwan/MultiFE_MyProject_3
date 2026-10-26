import { describe, expect, it } from "vitest";
import type { EvaluatedOptionGroup } from "@multife/backend/modules/rules/types";
import { buildSteps, selectedOption, unsupportedChoices } from "./customization";

const value = (key: string, label: string, isDefault = false) => ({ key, label, priceDelta: 0, extraLeadDays: 0, isDefault });

const neckline: EvaluatedOptionGroup = {
  groupKey: "neckline",
  groupLabel: "Neckline",
  values: [value("v-neck", "V-Neck"), value("boat-neck", "Boat Neck", true)],
};
const dupattaLength: EvaluatedOptionGroup = {
  groupKey: "dupatta-length",
  groupLabel: "Dupatta length",
  values: [value("short", "Short"), value("long", "Long")],
};
const closure: EvaluatedOptionGroup = { groupKey: "closure", groupLabel: "Closure", values: [value("zip", "Zip")] };

describe("buildSteps", () => {
  it("keeps only steps with offered groups, in the prototype's order", () => {
    const steps = buildSteps([dupattaLength, neckline]);

    expect(steps.map((s) => s.slug)).toEqual(["neck", "dupatta"]);
    expect(steps[0].groups.map((g) => g.id)).toEqual(["neckline"]);
  });

  it("shows only offered values, with database labels and the matching prototype picture", () => {
    const [neck] = buildSteps([neckline]);

    expect(neck.groups[0].options).toEqual([
      { id: "v-neck", label: "V-Neck", image: "/customize/neck-customization-v-neck.webp" },
      { id: "boat-neck", label: "Boat Neck", image: "/customize/neck-customization-boat-neck.webp" },
    ]);
  });

  it("leaves the picture empty for a value the prototype has no image for", () => {
    const [neck] = buildSteps([{ ...neckline, values: [value("round", "Round neck")] }]);

    expect(neck.groups[0].options[0].image).toBeNull();
  });

  it("puts groups the layout doesn't know on a closing More Details step", () => {
    const steps = buildSteps([neckline, closure]);

    expect(steps.map((s) => s.slug)).toEqual(["neck", "more-details"]);
    expect(steps[1].groups[0]).toMatchObject({ id: "closure", title: "Closure" });
  });

  it("drops a group with no values", () => {
    expect(buildSteps([{ ...neckline, values: [] }])).toEqual([]);
  });

  it("defaults to the template recommendation, then the marked default, then the first value", () => {
    expect(buildSteps([neckline], { neckline: "v-neck" })[0].groups[0].defaultId).toBe("v-neck");
    expect(buildSteps([neckline])[0].groups[0].defaultId).toBe("boat-neck");
    expect(buildSteps([closure])[0].groups[0].defaultId).toBe("zip");
  });

  it("ignores a recommendation that isn't offered", () => {
    expect(buildSteps([neckline], { neckline: "halter" })[0].groups[0].defaultId).toBe("boat-neck");
  });
});

describe("selectedOption", () => {
  const group = buildSteps([neckline])[0].groups[0];

  it("returns the saved choice", () => {
    expect(selectedOption(group, { neckline: "v-neck" }).id).toBe("v-neck");
  });

  it("falls back to the default when the saved choice is no longer offered", () => {
    expect(selectedOption(group, { neckline: "round" }).id).toBe("boat-neck");
  });
});

describe("unsupportedChoices", () => {
  const steps = buildSteps([neckline]);

  it("is empty when every saved choice is still offered", () => {
    expect(unsupportedChoices(steps, { neckline: "v-neck" })).toEqual([]);
  });

  it("flags a value the store stopped offering, pointing at its step", () => {
    expect(unsupportedChoices(steps, { neckline: "round" }, { neckline: "Neckline: Round neck" })).toEqual([
      { groupKey: "neckline", label: "Neckline: Round neck", stepSlug: "neck" },
    ]);
  });

  it("flags a whole group that is gone, with no step to re-pick in", () => {
    expect(unsupportedChoices(steps, { cuff: "soft" })).toEqual([{ groupKey: "cuff", label: "soft", stepSlug: null }]);
  });
});
