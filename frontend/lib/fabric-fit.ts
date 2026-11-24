import type { FabricRow, TemplateRow } from "@multife/backend/modules/catalog/types";
import { estimateFabricMetres } from "./catalog";

// FR-FAB-17: is there enough of a fabric left for an outfit in this size,
// before the customer customizes? Isomorphic, no I/O. Fabric for the cheapest
// style choices at the customer's size (their saved measurements, else the
// template's standard size); extras chosen later can need more, and the fabric
// hold at the measurements step re-checks the real figure.

export type TemplateFit = {
  // Metres this outfit needs, or null when the template has no yardage formula.
  requiredMetres: number | null;
  enough: boolean;
};

export function templateFit(
  template: Pick<TemplateRow, "yardage_formula" | "required_measurements">,
  fabric: Pick<FabricRow, "properties">,
  availableMetres: number,
  measurements: Record<string, number> | null = null,
): TemplateFit {
  const required = estimateFabricMetres(template, fabric, {}, measurements);
  if (required === null) return { requiredMetres: null, enough: availableMetres > 0 };
  return { requiredMetres: required, enough: availableMetres >= required };
}

export type FabricFit = {
  availableMetres: number;
  // Whose size the figures are for.
  basis: "saved" | "standard";
  fits: Record<string, TemplateFit>;
};

export function fabricFit(
  templates: (Pick<TemplateRow, "id" | "yardage_formula" | "required_measurements">)[],
  fabric: Pick<FabricRow, "properties">,
  availableMetres: number,
  measurements: Record<string, number> | null = null,
): FabricFit {
  return {
    availableMetres,
    basis: measurements && Object.keys(measurements).length > 0 ? "saved" : "standard",
    fits: Object.fromEntries(templates.map((t) => [t.id, templateFit(t, fabric, availableMetres, measurements)])),
  };
}
