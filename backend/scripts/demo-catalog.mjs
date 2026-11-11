// Demo catalogue — PLACEHOLDER DATA, agreed with the client (2026-11-11) until
// the partner stores' APIs are available. Brand names are real Pakistani
// retailers so the demo reads naturally; every fabric, price, stock figure
// and option set below is invented. Fabric photos are recoloured copies of
// MultiFe's own swatches in frontend/public/fabrics (see demo/ folder).
//
// Replace with the catalogue-sync job (FR-FAB-01…06) once store APIs arrive;
// demo fabrics are the ones whose external_id starts with DEMO_PREFIX.

import vocabulary from "../supabase/seed/demo-vocabulary.json" with { type: "json" };

export { vocabulary };

// Every demo fabric's external_id starts with this, so the rows are easy to
// find (and remove) later.
export const DEMO_PREFIX = "DEMO-";

// ---------------------------------------------------------------------------
// Templates — slugs match the template photos in frontend/public/templates.
// ---------------------------------------------------------------------------

const M = {
  height: { key: "height", label: "Height", unit: "cm", min: 140, max: 190 },
  neck: { key: "neck", label: "Neck", unit: "cm", min: 30, max: 45 },
  shoulder: { key: "shoulder_width", label: "Shoulder width", unit: "cm", min: 33, max: 50 },
  chest: { key: "chest", label: "Chest", unit: "cm", min: 75, max: 135 },
  waist: { key: "waist", label: "Waist", unit: "cm", min: 60, max: 125 },
  hip: { key: "hip", label: "Hip", unit: "cm", min: 80, max: 140 },
  sleeve: { key: "sleeve", label: "Sleeve length", unit: "cm", min: 45, max: 65 },
  armhole: { key: "armhole", label: "Armhole", unit: "cm", min: 35, max: 55 },
  shirtLength: { key: "shirt_length", label: "Shirt length", unit: "cm", min: 70, max: 115 },
  dressLength: { key: "dress_length", label: "Dress length", unit: "cm", min: 110, max: 160 },
  bottomLength: { key: "bottom_length", label: "Trouser length", unit: "cm", min: 85, max: 110 },
  thigh: { key: "thigh", label: "Thigh", unit: "cm", min: 45, max: 75 },
  ankle: { key: "ankle", label: "Ankle opening", unit: "cm", min: 20, max: 40 },
};

const TOP_MEASUREMENTS = [M.height, M.neck, M.shoulder, M.chest, M.waist, M.hip, M.sleeve, M.armhole];
const BOTTOM_MEASUREMENTS = [M.bottomLength, M.thigh, M.ankle];

// Option groups by area (keys from demo-vocabulary.json).
const TOP_GROUPS = [
  "neckline", "neck-depth", "neck-finish",
  "shoulder-style", "shoulder-width", "armhole-shape",
  "upper-arm-fit", "sleeve-volume", "decorative-style",
  "forearm-shape", "forearm-detail",
  "cuff-style", "edge-finish",
  "full-sleeve-style", "sleeve-finish",
  "body-shape", "fit-preference", "flare-level",
  "dress-length", "front-back-length",
  "hem-style", "hem-width",
  "finishing-detail", "lace-placement", "lace-style",
];
const FIT_GROUPS = ["torso-fit", "waist-shape", "ease-preference"];
const BOTTOM_GROUPS = [
  "bottom-wear-type", "style-family",
  "thigh-fit", "knee-shaping", "functional-details",
  "paincha-style", "lower-edge-finish", "ankle-opening-width",
];
const DUPATTA_GROUPS = ["dupatta-style", "dupatta-length", "dupatta-border"];

// Style extras: what a value adds to the price (PKR) and to the lead time
// (days — 0 everywhere: every outfit is delivered in 14 days, client decision
// 2026-11-11). Applies on every template that offers the value.
export const OPTION_EXTRAS = {
  "neck-finish": { "embroidered-front": [600, 0] },
  "decorative-style": { embroidered: [500, 0], "panel-detail": [300, 0] },
  "forearm-detail": { "embroidered-panel": [400, 0] },
  "cuff-style": { "embroidered-cuff": [350, 0], "lace-trim-cuff": [300, 0] },
  "edge-finish": { "beaded-finish": [450, 0] },
  "sleeve-finish": { embroidered: [400, 0], "lace-detail": [300, 0] },
  "body-shape": { anarkali: [1200, 0], angrakha: [900, 0], kalidar: [1000, 0] },
  "finishing-detail": { "minimal-embroidery": [700, 0], "festive-embroidery": [1800, 0], "full-border-set": [1500, 0] },
  "lace-style": { elegant: [300, 0], festive: [600, 0] },
  "bottom-wear-type": { gharara: [1500, 0], sharara: [1500, 0], "lehenga-skirt": [2000, 0] },
  "lower-edge-finish": { "embroidered-edge": [400, 0], "lace-edge": [300, 0] },
  "dupatta-style": {
    "chiffon-dupatta": [500, 0], "net-dupatta": [700, 0], "organza-dupatta": [900, 0],
    "banarsi-dupatta": [1800, 0], "embroidered-dupatta": [1500, 0],
  },
  "dupatta-border": { tassels: [250, 0], "lace-border": [400, 0], "embroidered-border": [700, 0], "gota-detail": [600, 0] },
};

// Yardage (SDS §6.2): base + coefficient × measurement (cm), plus a flat
// allowance when a fuller style is picked, then the wastage margin.
const FULLER_STYLES = {
  anarkali: 1.5, kalidar: 1.2, "frock-style": 0.8, "umbrella-sleeve": 0.4, "bell-sleeve": 0.25,
  "floor-length": 0.5, "ankle-length": 0.3,
};
const BOTTOM_STYLES = { gharara: 1.5, sharara: 1.5, "lehenga-skirt": 2, palazzo: 0.5 };

export const TEMPLATES = [
  {
    slug: "2-piece-suit", name: "2 Piece Suit", lead_days: 14, base_stitch_price: 3200,
    description: "Kameez with matching bottoms, stitched to your measurements.",
    groups: [...TOP_GROUPS, ...FIT_GROUPS, ...BOTTOM_GROUPS],
    measurements: [...TOP_MEASUREMENTS, M.shirtLength, ...BOTTOM_MEASUREMENTS],
    yardage: { base_metres: 2.2, coefficients: { chest: 0.012, hip: 0.01, ...FULLER_STYLES, ...BOTTOM_STYLES }, wastage_margin: 0.1 },
    recommended: { "dress-length": "knee-length", "bottom-wear-type": "shalwar", "style-family": "casual" },
  },
  {
    slug: "3-piece-suit", name: "3 Piece Suit", lead_days: 14, base_stitch_price: 4200,
    description: "Kameez, bottoms and a finished dupatta — the complete festive set.",
    groups: [...TOP_GROUPS, ...FIT_GROUPS, ...BOTTOM_GROUPS, ...DUPATTA_GROUPS],
    measurements: [...TOP_MEASUREMENTS, M.shirtLength, ...BOTTOM_MEASUREMENTS],
    yardage: { base_metres: 4.6, coefficients: { chest: 0.012, hip: 0.01, ...FULLER_STYLES, ...BOTTOM_STYLES }, wastage_margin: 0.1 },
    recommended: { "dress-length": "knee-length", "style-family": "festive" },
  },
  {
    slug: "a-line-frock", name: "A-Line Frock", lead_days: 14, base_stitch_price: 2800,
    description: "A fitted bodice that flares gently from the waist.",
    groups: [...TOP_GROUPS, ...FIT_GROUPS],
    measurements: [...TOP_MEASUREMENTS, M.dressLength],
    yardage: { base_metres: 1.4, coefficients: { chest: 0.01, hip: 0.008, ...FULLER_STYLES }, wastage_margin: 0.12 },
    recommended: { "body-shape": "a-line", "dress-length": "mid-calf", "flare-level": "full" },
  },
  {
    slug: "abaya", name: "Abaya", lead_days: 14, base_stitch_price: 3000,
    description: "A flowing full-length abaya with your choice of sleeves and finish.",
    groups: TOP_GROUPS.filter((g) => !["neck-depth", "lace-placement", "lace-style"].includes(g)),
    measurements: [M.height, M.shoulder, M.chest, M.waist, M.hip, M.sleeve, M.armhole, M.dressLength],
    yardage: { base_metres: 1.6, coefficients: { chest: 0.01, hip: 0.008, ...FULLER_STYLES }, wastage_margin: 0.1 },
    recommended: { "body-shape": "loose-fit", "dress-length": "floor-length", "fit-preference": "flowing" },
  },
  {
    slug: "long-kurti", name: "Long Kurti", lead_days: 14, base_stitch_price: 2200,
    description: "A long kurti that pairs with your own trousers or jeans.",
    groups: TOP_GROUPS,
    measurements: [...TOP_MEASUREMENTS, M.shirtLength],
    yardage: { base_metres: 0.9, coefficients: { chest: 0.01, hip: 0.006, ...FULLER_STYLES }, wastage_margin: 0.1 },
    recommended: { "dress-length": "knee-length", "body-shape": "straight-cut" },
  },
  {
    slug: "maxi-dress", name: "Maxi Dress", lead_days: 14, base_stitch_price: 3500,
    description: "A floor-length maxi with room to choose every detail.",
    groups: [...TOP_GROUPS, ...FIT_GROUPS],
    measurements: [...TOP_MEASUREMENTS, M.dressLength],
    yardage: { base_metres: 1.8, coefficients: { chest: 0.012, hip: 0.01, ...FULLER_STYLES }, wastage_margin: 0.12 },
    recommended: { "dress-length": "floor-length", "body-shape": "a-line", "fit-preference": "flowing" },
  },
  {
    slug: "peplum-set", name: "Peplum Set", lead_days: 14, base_stitch_price: 3400,
    description: "A peplum top with matching bottoms.",
    groups: [...TOP_GROUPS, ...FIT_GROUPS, ...BOTTOM_GROUPS],
    measurements: [...TOP_MEASUREMENTS, M.shirtLength, ...BOTTOM_MEASUREMENTS],
    yardage: { base_metres: 2.0, coefficients: { chest: 0.012, hip: 0.01, ...FULLER_STYLES, ...BOTTOM_STYLES }, wastage_margin: 0.1 },
    recommended: { "body-shape": "peplum", "dress-length": "hip-length", "bottom-wear-type": "cigarette-pant" },
  },
];

// ---------------------------------------------------------------------------
// What each kind of fabric can't be made into (fabrics.supported_options is
// the full vocabulary minus these). Every group keeps several values, so all
// templates stay compatible with every demo fabric.
// ---------------------------------------------------------------------------

export const FABRIC_LIMITS = {
  // Sheer, fluid fabrics: nothing stiff or tailored.
  sheer: {
    "shoulder-style": ["structured-shoulder"],
    "armhole-shape": ["tailored"],
    "fit-preference": ["structured"],
    "torso-fit": ["structured-fit"],
    "bottom-wear-type": ["cigarette-pant", "trouser", "straight-pant"],
    "knee-shaping": ["structured-knee"],
    "cuff-style": ["button-cuff", "loop-button-cuff"],
    "forearm-detail": ["button-tab"],
    "paincha-style": ["cuffed-paincha"],
  },
  // Heavy, stiff fabrics: no gathered volume or fragile finishes.
  heavy: {
    "full-sleeve-style": ["umbrella-sleeve", "bishop-sleeve", "puff-sleeve"],
    "upper-arm-fit": ["gathered-upper-arm"],
    "forearm-shape": ["gathered-forearm"],
    "cuff-style": ["frill-cuff"],
    "body-shape": ["kalidar", "kaftan"],
    "bottom-wear-type": ["gharara", "sharara"],
    "dupatta-style": ["net-dupatta", "organza-dupatta"],
  },
  // Everyday cottons: no heavy festive work.
  everyday: {
    "edge-finish": ["beaded-finish"],
    "finishing-detail": ["festive-embroidery", "full-border-set"],
    "lace-style": ["festive"],
    "dupatta-style": ["banarsi-dupatta"],
    "dupatta-border": ["gota-detail"],
    "bottom-wear-type": ["lehenga-skirt"],
  },
  // Silks and festive fabrics: everything.
  full: {},
};

// ---------------------------------------------------------------------------
// Brands and their fabrics (the "khadi" slug is kept from the first fixture;
// the brand is Khaadi). image: [source swatch in /public/fabrics, tint]
// (tint null = the original colour).
// ---------------------------------------------------------------------------

const f = (code, name, composition, fibre, weight, drape, opacity, price, stock, image, limits, extra = {}) => ({
  code, name, composition, price, stock, image, limits,
  properties: { fibre, weight, drape, stretch: extra.stretch ?? "none", opacity, directional_pattern: extra.directional ?? false },
});

export const BRANDS = [
  {
    slug: "khadi", name: "Khaadi", color: "#8B5E3C",
    fabrics: [
      f("KH-01", "Handloom Khaddar, Rust", "100% cotton khaddar", "khaddar", "heavy", "structured", "opaque", 1150, 180, ["cotton", "#B5562E"], "heavy"),
      f("KH-02", "Handloom Khaddar, Indigo", "100% cotton khaddar", "khaddar", "heavy", "structured", "opaque", 1150, 160, ["cotton", "#2E4A7D"], "heavy"),
      f("KH-03", "Woven Cotton, Natural", "100% cotton", "cotton", "medium", "structured", "opaque", 950, 220, ["cotton", null], "everyday"),
      f("KH-04", "Slub Linen, Olive", "55% linen, 45% cotton", "linen", "medium", "crisp", "opaque", 1450, 120, ["linen", "#6B7A3A"], "everyday"),
      f("KH-05", "Raw Silk, Gold", "100% silk", "silk", "light", "fluid", "opaque", 2600, 70, ["silk", null], "full"),
      f("KH-06", "Printed Lawn, Mustard Block", "100% cotton lawn", "lawn", "light", "soft", "semi-sheer", 850, 260, ["lawn", "#C99A2E"], "everyday", { directional: true }),
    ],
  },
  {
    slug: "sana-safinaz", name: "Sana Safinaz", color: "#1F2A44",
    fabrics: [
      f("SS-01", "Luxury Lawn, Mint Bloom", "100% cotton lawn", "lawn", "light", "soft", "semi-sheer", 1350, 240, ["lawn", null], "everyday", { directional: true }),
      f("SS-02", "Pure Chiffon, Blush", "100% polyester chiffon", "chiffon", "light", "fluid", "sheer", 1900, 140, ["chiffon", "#D99AA5"], "sheer"),
      f("SS-03", "Jacquard Silk, Champagne", "70% silk, 30% viscose", "silk", "medium", "fluid", "opaque", 3200, 80, ["silk", "#D8BE8A"], "full"),
      f("SS-04", "Organza, Mint", "100% silk organza", "organza", "light", "crisp", "sheer", 3600, 60, ["organza", null], "sheer"),
      f("SS-05", "Cambric, Sea Green", "100% cotton cambric", "cotton", "medium", "soft", "opaque", 1100, 200, ["cotton", "#3E8E7E"], "everyday"),
      f("SS-06", "Velvet, Midnight", "100% polyester velvet", "velvet", "heavy", "structured", "opaque", 2900, 90, ["velvet", "#1E2B4F"], "heavy", { directional: true }),
    ],
  },
  {
    slug: "j", name: "J.", color: "#7A1F2B",
    fabrics: [
      f("J-01", "Printed Lawn, Coral", "100% cotton lawn", "lawn", "light", "soft", "semi-sheer", 1050, 250, ["lawn", "#E07A5F"], "everyday", { directional: true }),
      f("J-02", "Khaddar, Charcoal", "100% cotton khaddar", "khaddar", "heavy", "structured", "opaque", 1250, 170, ["cotton", "#3A3A3A"], "heavy"),
      f("J-03", "Karandi, Camel", "60% cotton, 40% polyester", "karandi", "heavy", "structured", "opaque", 1500, 130, ["linen", "#B08A5A"], "heavy"),
      f("J-04", "Embroidered Lawn, Navy", "100% cotton lawn", "lawn", "light", "soft", "semi-sheer", 1600, 150, ["embroidered", null], "everyday"),
      f("J-05", "Silk Blend, Maroon", "50% silk, 50% viscose", "silk", "medium", "fluid", "opaque", 2400, 100, ["silk", "#7A1F2B"], "full"),
      f("J-06", "Cotton Net, Black", "100% cotton net", "net", "light", "airy", "sheer", 1700, 90, ["net", "#2B2B2B"], "sheer"),
    ],
  },
  {
    slug: "gul-ahmed", name: "Gul Ahmed", color: "#0E4D64",
    fabrics: [
      f("GA-01", "Digital Print Lawn, Teal Paisley", "100% cotton lawn", "lawn", "light", "soft", "semi-sheer", 990, 300, ["lawn", "#2A8C8C"], "everyday", { directional: true }),
      f("GA-02", "Cambric, Powder Blue", "100% cotton cambric", "cotton", "medium", "soft", "opaque", 1050, 230, ["cotton", "#8DB3D9"], "everyday"),
      f("GA-03", "Chiffon, Emerald", "100% polyester chiffon", "chiffon", "light", "fluid", "sheer", 1750, 120, ["chiffon", "#1F7A54"], "sheer"),
      f("GA-04", "Festive Jacquard, Gold", "80% viscose, 20% metallic", "jacquard", "medium", "structured", "opaque", 2750, 85, ["festive", null], "full"),
      f("GA-05", "Linen, Sand", "100% linen", "linen", "medium", "crisp", "opaque", 1400, 160, ["linen", null], "everyday"),
      f("GA-06", "Velvet, Bottle Green", "100% polyester velvet", "velvet", "heavy", "structured", "opaque", 2700, 75, ["velvet", "#1D4A36"], "heavy", { directional: true }),
    ],
  },
  {
    slug: "alkaram-studio", name: "Alkaram Studio", color: "#A0522D",
    fabrics: [
      f("AK-01", "Lawn, Lilac Floral", "100% cotton lawn", "lawn", "light", "soft", "semi-sheer", 920, 280, ["lawn", "#A68BC2"], "everyday", { directional: true }),
      f("AK-02", "Cotton Satin, Peach", "97% cotton, 3% elastane", "cotton", "medium", "soft", "opaque", 1200, 190, ["silk", "#E8A87C"], "everyday", { stretch: "slight" }),
      f("AK-03", "Organza, Dusty Rose", "100% polyester organza", "organza", "light", "crisp", "sheer", 1850, 110, ["organza", "#C98B8B"], "sheer"),
      f("AK-04", "Khaddar, Mustard", "100% cotton khaddar", "khaddar", "heavy", "structured", "opaque", 1100, 175, ["cotton", "#C9A227"], "heavy"),
      f("AK-05", "Raw Silk, Plum", "100% silk", "silk", "light", "fluid", "opaque", 2500, 70, ["silk", "#6B2D5C"], "full"),
      f("AK-06", "Embroidered Cambric, Navy", "100% cotton cambric", "cotton", "medium", "soft", "opaque", 1650, 120, ["embroidered", null], "everyday"),
    ],
  },
  {
    slug: "nishat-linen", name: "Nishat Linen", color: "#2F4F4F",
    fabrics: [
      f("NL-01", "Printed Lawn, Sky Stripe", "100% cotton lawn", "lawn", "light", "soft", "semi-sheer", 980, 260, ["lawn", "#7FB2D6"], "everyday", { directional: true }),
      f("NL-02", "Linen, Slate", "100% linen", "linen", "medium", "crisp", "opaque", 1500, 150, ["linen", "#5A6E7A"], "everyday"),
      f("NL-03", "Dobby Cotton, Cream", "100% cotton", "cotton", "medium", "structured", "opaque", 1000, 210, ["cotton", null], "everyday"),
      f("NL-04", "Silk, Teal", "100% silk", "silk", "light", "fluid", "opaque", 2650, 80, ["silk", "#2D7D7A"], "full"),
      f("NL-05", "Chiffon, Lemon", "100% polyester chiffon", "chiffon", "light", "fluid", "sheer", 1650, 115, ["chiffon", "#E8D36A"], "sheer"),
      f("NL-06", "Karandi, Rust", "60% cotton, 40% polyester", "karandi", "heavy", "structured", "opaque", 1450, 140, ["linen", "#A4532F"], "heavy"),
    ],
  },
  {
    slug: "bonanza-satrangi", name: "Bonanza Satrangi", color: "#C2185B",
    fabrics: [
      f("BS-01", "Lawn, Fuchsia Print", "100% cotton lawn", "lawn", "light", "soft", "semi-sheer", 900, 270, ["lawn", "#C2185B"], "everyday", { directional: true }),
      f("BS-02", "Cambric, Turquoise", "100% cotton cambric", "cotton", "medium", "soft", "opaque", 1000, 220, ["cotton", "#2BB3B1"], "everyday"),
      f("BS-03", "Net, Ruby", "100% nylon net", "net", "light", "airy", "sheer", 1600, 100, ["net", "#9B111E"], "sheer"),
      f("BS-04", "Festive Silk, Bronze", "80% silk, 20% metallic", "silk", "medium", "fluid", "opaque", 2900, 75, ["festive", "#9C6B3A"], "full"),
      f("BS-05", "Khaddar, Olive", "100% cotton khaddar", "khaddar", "heavy", "structured", "opaque", 1150, 165, ["cotton", "#6B7A3A"], "heavy"),
      f("BS-06", "Velvet, Wine", "100% polyester velvet", "velvet", "heavy", "structured", "opaque", 2600, 80, ["velvet", "#5C1A2B"], "heavy", { directional: true }),
    ],
  },
  {
    slug: "maria-b", name: "Maria B", color: "#4A148C",
    fabrics: [
      f("MB-01", "Embroidered Chiffon, Midnight", "100% polyester chiffon", "chiffon", "light", "fluid", "sheer", 3400, 70, ["embroidered", null], "sheer"),
      f("MB-02", "Organza, Lavender", "100% silk organza", "organza", "light", "crisp", "sheer", 3100, 65, ["organza", "#B39DDB"], "sheer"),
      f("MB-03", "Luxury Lawn, Pistachio", "100% cotton lawn", "lawn", "light", "soft", "semi-sheer", 1450, 200, ["lawn", "#A8C69F"], "everyday", { directional: true }),
      f("MB-04", "Festive Jacquard, Ruby", "80% viscose, 20% metallic", "jacquard", "medium", "structured", "opaque", 3300, 60, ["festive", "#9B111E"], "full"),
      f("MB-05", "Velvet, Royal Purple", "100% polyester velvet", "velvet", "heavy", "structured", "opaque", 3200, 70, ["velvet", "#4A148C"], "heavy", { directional: true }),
      f("MB-06", "Silk, Rose Gold", "100% silk", "silk", "light", "fluid", "opaque", 3500, 55, ["silk", "#D4A59A"], "full"),
    ],
  },
];

export const fabricImagePath = (code) => `/fabrics/demo/${code.toLowerCase()}.webp`;

// Brand logo (square tile) and banner, from each brand's own website, in
// frontend/public/brands/<slug>/. Trademarks of their owners — demo use only;
// get the brands' permission (or their own assets via the API) before launch.
export const brandLogoPath = (slug) => `/brands/${slug}/logo.webp`;
export const brandBannerPath = (slug) => `/brands/${slug}/banner.webp`;

// supported_options for a demo fabric: the full vocabulary minus its limits.
export function supportedOptionsFor(limitsKey) {
  const limits = FABRIC_LIMITS[limitsKey];
  if (!limits) throw new Error(`Unknown fabric limits "${limitsKey}"`);
  return Object.fromEntries(
    vocabulary.map((g) => [g.key, g.values.map((v) => v.key).filter((k) => !(limits[g.key] ?? []).includes(k))]),
  );
}
