import type { MeasurementField } from "./validateMeasurements";

// The full set of body measurements MultiFe works with, for an agent's home
// visit (FR-AGT-12), where no template is chosen yet. Same keys and ranges as
// the templates' required_measurements (standardMeasurements.test.ts checks
// the demo templates), so a later order prefills from what the agent took.
export const STANDARD_MEASUREMENTS: MeasurementField[] = [
  { key: "height", label: "Height", unit: "cm", min: 140, max: 190 },
  { key: "neck", label: "Neck", unit: "cm", min: 30, max: 45 },
  { key: "shoulder_width", label: "Shoulder width", unit: "cm", min: 33, max: 50 },
  { key: "chest", label: "Chest", unit: "cm", min: 75, max: 135 },
  { key: "waist", label: "Waist", unit: "cm", min: 60, max: 125 },
  { key: "hip", label: "Hip", unit: "cm", min: 80, max: 140 },
  { key: "sleeve", label: "Sleeve length", unit: "cm", min: 45, max: 65 },
  { key: "armhole", label: "Armhole", unit: "cm", min: 35, max: 55 },
  { key: "shirt_length", label: "Shirt length", unit: "cm", min: 70, max: 115 },
  { key: "dress_length", label: "Dress length", unit: "cm", min: 110, max: 160 },
  { key: "bottom_length", label: "Trouser length", unit: "cm", min: 85, max: 110 },
  { key: "thigh", label: "Thigh", unit: "cm", min: 45, max: 75 },
  { key: "ankle", label: "Ankle opening", unit: "cm", min: 20, max: 40 },
];

// Taken at every visit; the rest are optional (they depend on the outfit).
export const CORE_MEASUREMENT_KEYS = ["height", "shoulder_width", "chest", "waist", "hip", "sleeve"];
