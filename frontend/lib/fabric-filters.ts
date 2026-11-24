import type { FabricRow } from "@multife/backend/modules/catalog/types";
import { fabricName } from "./catalog";
import { LOW_STOCK_METRES } from "./supplier-panel-stats";

// Storefront fabric library filters (FR-CUS-03): material and availability.
// Pure helpers, no I/O. Isomorphic: the page reads stock on the server and the
// library filters in the browser.

export type Availability = "in_stock" | "low_stock" | "out_of_stock";

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
};

const AVAILABILITY_ORDER: Availability[] = ["in_stock", "low_stock", "out_of_stock"];

type FilterableFabric = Pick<FabricRow, "id" | "name" | "display_name" | "composition" | "properties">;

// The fabric's material, from the feed's `fibre` property (e.g. "cotton",
// "lawn", "silk"), lower-cased so "Silk" and "silk" are one option. Null when
// the feed doesn't say.
export function fabricMaterial(fabric: Pick<FabricRow, "properties">): string | null {
  const value = fabric.properties?.fibre;
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

// Metres left to sell (roll on hand − fabric held for orders and checkouts).
export function availabilityOf(availableMetres: number): Availability {
  if (availableMetres <= 0) return "out_of_stock";
  if (availableMetres < LOW_STOCK_METRES) return "low_stock";
  return "in_stock";
}

export type FilterOption<T extends string = string> = { value: T; label: string; count: number };

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Materials present in this store, alphabetical, with how many fabrics each.
export function materialOptions(fabrics: Pick<FabricRow, "properties">[]): FilterOption[] {
  const counts = new Map<string, number>();
  for (const f of fabrics) {
    const material = fabricMaterial(f);
    if (material) counts.set(material, (counts.get(material) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, count]) => ({ value, label: capitalise(value), count }));
}

// Every availability state, in a fixed order, with how many fabrics are in it
// (0 included, so the dropdown always shows the same choices).
export function availabilityOptions(
  fabrics: Pick<FabricRow, "id">[],
  availableMetres: (fabricId: string) => number,
): FilterOption<Availability>[] {
  const counts = new Map<Availability, number>();
  for (const f of fabrics) {
    const state = availabilityOf(availableMetres(f.id));
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return AVAILABILITY_ORDER.map((value) => ({ value, label: AVAILABILITY_LABELS[value], count: counts.get(value) ?? 0 }));
}

export type FabricFilters = { query: string; material: string; availability: Availability | "" };

export const NO_FILTERS: FabricFilters = { query: "", material: "", availability: "" };

export const hasFilters = (filters: FabricFilters) =>
  filters.query.trim() !== "" || filters.material !== "" || filters.availability !== "";

// Search (name or composition) AND material AND availability; an empty filter
// matches everything.
export function filterFabrics<F extends FilterableFabric>(
  fabrics: F[],
  filters: FabricFilters,
  availableMetres: (fabricId: string) => number,
): F[] {
  const q = filters.query.trim().toLowerCase();
  return fabrics.filter(
    (f) =>
      (!q || `${fabricName(f)} ${f.composition ?? ""}`.toLowerCase().includes(q)) &&
      (!filters.material || fabricMaterial(f) === filters.material) &&
      (!filters.availability || availabilityOf(availableMetres(f.id)) === filters.availability),
  );
}
