import type { EvaluatedOptionGroup } from "@multife/backend/modules/rules/types";

// The 15 customization steps, transcribed from the client-approved prototype
// (multi-fe-user-end.vercel.app): same groups, options, defaults and order.
// Images live in /public/customize, named "<file prefix>-<option>".
//
// This is only the layout — which step each option group sits in, and the
// picture for each value. What a customer can actually pick comes from the
// database (the template's options the fabric supports, verified by an
// admin); buildSteps() fits that into this layout. Group ids and option ids
// here are the option_groups.key / option_values.key they match.

// priceDelta: what choosing this value adds to the order (template_options.price_delta).
export type Option = { id: string; label: string; image: string | null; priceDelta: number };

export type Group = {
  id: string;
  title: string;
  options: Option[];
  defaultId: string;
};

export type Step = {
  slug: string;
  title: string;
  subtitle: string;
  cta: string;
  reviewLabel: string;
  note?: string;
  groups: Group[];
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// label shown to the customer; file = image name when it differs from the label.
type Raw = string | [label: string, file: string, prefix?: string];

function group(id: string, title: string, prefix: string, raw: Raw[], defaultLabel: string): Group {
  const options = raw.map((r) => {
    const [label, file, ownPrefix] = typeof r === "string" ? [r, r, undefined] : r;
    return { id: slugify(label), label, image: `/customize/${ownPrefix ?? prefix}-${slugify(file)}.webp`, priceDelta: 0 };
  });
  const defaultId = slugify(defaultLabel);
  if (!options.some((o) => o.id === defaultId)) throw new Error(`Bad default ${defaultLabel} in ${id}`);
  return { id, title, options, defaultId };
}

const LAYOUT: Step[] = [
  {
    slug: "neck",
    title: "Neck Customization",
    subtitle: "Choose the neckline style for your outfit.",
    cta: "Save Neck Selection",
    reviewLabel: "Neck",
    groups: [
      group("neckline", "Neckline", "neck-customization",
        ["Round Neck", ["V-Neck", "V Neck"], "Boat Neck", "Square Neck", "Mandarin Collar", "Jewel Neck", "Keyhole", "Scoop Neck"],
        "Round Neck"),
      group("neck-depth", "Neck Depth", "neck-depth", ["Shallow", "Standard", "Deep"], "Standard"),
      group("neck-finish", "Front / Back Finish", "front-finish",
        ["Plain Front", "Embroidered Front", ["Closed Back", "Closed Back", "back-finish"], ["Keyhole Back", "Keyhole Back", "back-finish"]],
        "Closed Back"),
    ],
  },
  {
    slug: "shoulder-armhole",
    title: "Shoulder & Armhole",
    subtitle: "Adjust shoulder shape and armhole comfort.",
    cta: "Save Shoulder Settings",
    reviewLabel: "Shoulder & Armhole",
    note: "These settings help customize the fit and comfort around your shoulders and armholes.",
    groups: [
      group("shoulder-style", "Shoulder Style", "shoulder-style",
        ["Standard Shoulder", "Relaxed Shoulder", "Structured Shoulder", "Dropped Shoulder"], "Standard Shoulder"),
      group("shoulder-width", "Shoulder Width", "shoulder-width", ["Narrow", "Standard", "Broad"], "Standard"),
      group("armhole-shape", "Armhole Shape", "armhole-shape",
        ["Standard", "Comfort Fit", "Tailored", "Deep Armhole"], "Comfort Fit"),
    ],
  },
  {
    slug: "upper-arm",
    title: "Upper Arm Customization",
    subtitle: "Choose the upper sleeve fit and shape.",
    cta: "Save Upper Arm Settings",
    reviewLabel: "Upper Arm",
    groups: [
      group("upper-arm-fit", "Upper Arm Fit", "upper-arm-fit",
        ["Slim Fit", "Regular Fit", "Comfort Fit", "Relaxed Fit", "Gathered Upper Arm", "Pleated Upper Arm"], "Regular Fit"),
      group("sleeve-volume", "Sleeve Volume", "sleeve-volume", ["Minimal", "Moderate", "Full"], "Moderate"),
      group("decorative-style", "Decorative Style", "decorative-style",
        ["Plain", "Piping", "Embroidered", "Panel Detail"], "Plain"),
    ],
  },
  {
    slug: "forearm",
    title: "Forearm Customization",
    subtitle: "Refine the lower sleeve shape and fit.",
    cta: "Save Forearm Settings",
    reviewLabel: "Forearm",
    groups: [
      group("forearm-shape", "Forearm Shape", "forearm-shape",
        ["Narrow Forearm", "Straight Forearm", "Regular Forearm", "Tapered Forearm", "Loose Forearm", "Gathered Forearm"],
        "Regular Forearm"),
      group("forearm-detail", "Forearm Detail", "forearm-detail",
        ["Plain", "Button Tab", "Slit Opening", "Embroidered Panel"], "Plain"),
    ],
  },
  {
    slug: "cuff",
    title: "Sleeve End / Cuff",
    subtitle: "Choose how the sleeve finishes.",
    cta: "Save Cuff Selection",
    reviewLabel: "Cuff",
    note: "The cuff finish enhances both style and comfort. You can preview your selection in the final review.",
    groups: [
      group("cuff-style", "Cuff Style", "cuff-style",
        ["Plain Hem", "Narrow Cuff", "Button Cuff", "Embroidered Cuff", "Lace Trim Cuff", "Scallop Edge", "Frill Cuff", "Loop Button Cuff"],
        "Plain Hem"),
      group("edge-finish", "Edge Finish", "edge-finish",
        ["Clean Fold", "Piping", "Contrast Border", "Beaded Finish"], "Clean Fold"),
    ],
  },
  {
    slug: "sleeve",
    title: "Full Sleeve Style",
    subtitle: "Select the overall sleeve design.",
    cta: "Save Sleeve Style",
    reviewLabel: "Full Sleeve",
    groups: [
      group("full-sleeve-style", "Full Sleeve Style", "full-sleeve-style",
        ["Straight Sleeve", "Bell Sleeve", "Bishop Sleeve", "Puff Sleeve", "Panel Sleeve", "Flared Sleeve", "Slit Sleeve", "Umbrella Sleeve"],
        "Straight Sleeve"),
      group("sleeve-finish", "Sleeve Finish", "sleeve-finish",
        ["Simple", "Embroidered", "Contrast Border", "Lace Detail"], "Simple"),
    ],
  },
  {
    slug: "silhouette",
    title: "Body / Silhouette",
    subtitle: "Choose the overall dress shape and fall.",
    cta: "Save Silhouette",
    reviewLabel: "Body / Silhouette",
    groups: [
      group("body-shape", "Body Shape", "body-shape",
        ["Straight Cut", "A-Line", "Semi-Fitted", "Loose Fit", "Angrakha", "Anarkali", "Kalidar", "Peplum", "Kaftan", "Frock Style"],
        "Straight Cut"),
      group("fit-preference", "Fit Preference", "fit-preference", ["Structured", "Relaxed", "Flowing"], "Structured"),
      group("flare-level", "Flare Level", "flare-level", ["Minimal", "Moderate", "Full"], "Moderate"),
    ],
  },
  {
    slug: "length",
    title: "Kameez Length",
    subtitle: "Select your preferred dress length.",
    cta: "Save Length Selection",
    reviewLabel: "Kameez Length",
    groups: [
      group("dress-length", "Dress Length", "dress-length",
        ["Short", "Hip Length", "Knee Length", "Mid-Calf", "Ankle Length", "Floor Length"], "Hip Length"),
      group("front-back-length", "Front / Back Length", "front-back-length",
        ["Same Length", "Slight High-Low", "Extended Back"], "Same Length"),
    ],
  },
  {
    slug: "hem",
    title: "Daman / Chaak / Hem",
    subtitle: "Customize the lower hem and slit details.",
    cta: "Save Hem Details",
    reviewLabel: "Hem / Chaak",
    groups: [
      group("hem-style", "Hem Style", "hem-style",
        ["Straight Daman", "Rounded Hem", "High-Low Hem", "Side Chaak", "Double Chaak", "Front Slit", "Scalloped Hem", "Asymmetric Hem"],
        "Straight Daman"),
      group("hem-width", "Hem Width", "hem-width", ["Slim", "Standard", "Wide"], "Standard"),
    ],
  },
  {
    slug: "finishing",
    title: "Lace / Embroidery / Border",
    subtitle: "Select finishing details for your outfit.",
    cta: "Save Finishing Details",
    reviewLabel: "Lace / Embroidery / Border",
    groups: [
      group("finishing-detail", "Finishing Detail", "finishing-detail",
        ["Neck Border", "Sleeve Border", "Daman Border", "Front Patti", "Side Lace", "Minimal Embroidery", "Festive Embroidery", "Full Border Set"],
        "Neck Border"),
      group("lace-placement", "Placement", "lace-placement", ["Neckline", "Sleeves", "Hem"], "Neckline"),
      group("lace-style", "Style Level", "lace-style",
        [["Minimal", "Leve Minimal"], ["Elegant", "Level Elegant"], ["Festive", "Level Festive"]], "Minimal"),
    ],
  },
  {
    slug: "bottom-wear",
    title: "Bottom Wear Type",
    subtitle: "Choose the lower garment style for your outfit.",
    cta: "Save Bottom Wear Selection",
    reviewLabel: "Bottom Wear Type",
    groups: [
      group("bottom-wear-type", "Bottom Wear Type", "bottom-wear-type",
        ["Shalwar", "Straight Pant", "Cigarette Pant", "Trouser", "Palazzo", "Tulip Pant", "Gharara", "Sharara", "Lehenga Skirt"],
        "Shalwar"),
      group("style-family", "Style Family", "style-family", ["Casual", "Festive", "Formal"], "Festive"),
    ],
  },
  {
    slug: "body-fit",
    title: "Body Fit Customization",
    subtitle: "Adjust the outfit fit before lower-wear details.",
    cta: "Save Body Fit Settings",
    reviewLabel: "Bottom Fit",
    groups: [
      group("torso-fit", "Torso Fit", "torso-fit",
        ["Slim Fit", "Regular Fit", "Comfort Fit", "Relaxed Fit", "Loose Fit", "Structured Fit"], "Regular Fit"),
      group("waist-shape", "Waist Shape", "waist-shape",
        ["Straight Waist", "Natural Waist", "Empire Waist"], "Natural Waist"),
      group("ease-preference", "Ease Preference", "ease-preference",
        ["Close Ease", "Standard Ease", "Extra Ease"], "Standard Ease"),
    ],
  },
  {
    slug: "thigh-knee",
    title: "Thigh / Knee Customization",
    subtitle: "Adjust the thigh and knee shape of your lower garment.",
    cta: "Save Thigh & Knee Settings",
    reviewLabel: "Thigh / Knee",
    groups: [
      group("thigh-fit", "Thigh Fit", "thigh-fit",
        ["Slim Thigh", "Regular Thigh", "Relaxed Thigh", "Pleated Thigh"], "Regular Thigh"),
      group("knee-shaping", "Knee Shaping", "knee-shaping",
        ["Straight Knee", "Tapered Knee", "Flared Knee", "Structured Knee"], "Straight Knee"),
      group("functional-details", "Functional Details", "functional-detail",
        ["Side Pleat", "Panel Seam", "Extra Ease"], "Side Pleat"),
    ],
  },
  {
    slug: "paincha",
    title: "Paincha / Lower Leg Customization",
    subtitle: "Refine the lower leg opening and finish of your bottom wear.",
    cta: "Save Paincha Settings",
    reviewLabel: "Paincha / Lower Leg",
    groups: [
      group("paincha-style", "Paincha Style", "paincha-style",
        ["Narrow Paincha", "Straight Paincha", "Wide Paincha", "Tapered Paincha", "Cuffed Paincha", "Flared Paincha"],
        "Wide Paincha"),
      group("lower-edge-finish", "Lower Edge Finish", "lower-edge-finish",
        ["Plain Edge", "Lace Edge", "Embroidered Edge", ["Button Detail", "Button Edge"], "Slit Opening", ["Scalloped Edge", "Scallop Edge"]],
        "Embroidered Edge"),
      group("ankle-opening-width", "Ankle Opening Width", "ankle-opening-width",
        ["Narrow", "Standard", "Wide"], "Standard"),
    ],
  },
  {
    slug: "dupatta",
    title: "Dupatta Customization",
    subtitle: "Select the dupatta style and finish for your outfit.",
    cta: "Save Dupatta Selection",
    reviewLabel: "Dupatta",
    groups: [
      group("dupatta-style", "Dupatta Style", "dupatta-style",
        ["Standard Dupatta", "Chiffon Dupatta", "Organza Dupatta", "Net Dupatta", "Banarsi Dupatta", "Embroidered Dupatta"],
        "Standard Dupatta"),
      group("dupatta-length", "Dupatta Length", "dupatta-length", ["Short", "Standard", "Long"], "Standard"),
      group("dupatta-border", "Dupatta Border / Finishing", "dupatta-border",
        ["Plain Border", "Lace Border", "Embroidered Border", "Tassels", "Gota Detail"], "Tassels"),
    ],
  },
];

// Offered groups the layout doesn't place yet (e.g. a new group in the
// vocabulary) still reach the customer, on one closing step.
const EXTRA_STEP = {
  slug: "more-details",
  title: "More Details",
  subtitle: "A few more choices for this outfit.",
  cta: "Save Details",
  reviewLabel: "More details",
};

export type Selections = Record<string, string>;

// Fits offered groups (evaluateOptions output, or the whole vocabulary for the
// admin screen) into the prototype's steps. Steps with nothing offered are
// left out. Default per group: the template's recommendation, then the
// option marked default, then the prototype's default, then the first value.
export function buildSteps(groups: EvaluatedOptionGroup[], recommended: Record<string, string> = {}): Step[] {
  const byKey = new Map(groups.map((g) => [g.groupKey, g]));
  const placed = new Set<string>();

  const toGroup = (offered: EvaluatedOptionGroup, layout?: Group): Group => {
    const options = offered.values.map((v) => ({
      id: v.key,
      label: v.label,
      image: layout?.options.find((o) => o.id === v.key)?.image ?? null,
      priceDelta: v.priceDelta,
    }));
    const has = (id: string | undefined) => (id && options.some((o) => o.id === id) ? id : undefined);
    const defaultId =
      has(recommended[offered.groupKey]) ??
      has(offered.values.find((v) => v.isDefault)?.key) ??
      has(layout?.defaultId) ??
      options[0].id;
    return { id: offered.groupKey, title: layout?.title ?? offered.groupLabel, options, defaultId };
  };

  const steps: Step[] = [];
  for (const step of LAYOUT) {
    const stepGroups = step.groups.flatMap((layoutGroup) => {
      const offered = byKey.get(layoutGroup.id);
      if (!offered || offered.values.length === 0) return [];
      placed.add(offered.groupKey);
      return [toGroup(offered, layoutGroup)];
    });
    if (stepGroups.length > 0) steps.push({ ...step, groups: stepGroups });
  }

  const extra = groups.filter((g) => !placed.has(g.groupKey) && g.values.length > 0).map((g) => toGroup(g));
  if (extra.length > 0) steps.push({ ...EXTRA_STEP, groups: extra });

  return steps;
}

export function selectedOption(group: Group, selections: Selections): Option {
  const id = selections[group.id] ?? group.defaultId;
  return group.options.find((o) => o.id === id) ?? group.options.find((o) => o.id === group.defaultId)!;
}

export type UnsupportedChoice = { groupKey: string; label: string; stepSlug: string | null };

// Saved choices this fabric/template no longer offers (agreed: warn, don't
// silently swap). stepSlug is where to re-pick, or null when the whole group
// is gone and the choice simply drops out of the order.
export function unsupportedChoices(
  steps: Step[],
  selections: Selections,
  labels: Record<string, string> = {},
): UnsupportedChoice[] {
  return Object.entries(selections).flatMap(([groupKey, valueKey]) => {
    const step = steps.find((s) => s.groups.some((g) => g.id === groupKey));
    const group = step?.groups.find((g) => g.id === groupKey);
    if (group?.options.some((o) => o.id === valueKey)) return [];
    return [{ groupKey, label: labels[groupKey] ?? valueKey, stepSlug: step?.slug ?? null }];
  });
}
