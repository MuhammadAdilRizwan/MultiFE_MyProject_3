import { describe, expect, it } from "vitest";
import {
  NO_FILTERS,
  availabilityOf,
  availabilityOptions,
  fabricMaterial,
  filterFabrics,
  hasFilters,
  materialOptions,
} from "./fabric-filters";

const fabric = (id: string, name: string, fibre: unknown, composition: string | null = null) => ({
  id,
  name,
  display_name: null,
  composition,
  properties: { fibre } as Record<string, unknown>,
});

const fabrics = [
  fabric("a", "Raw Silk, Gold", "silk", "100% silk"),
  fabric("b", "Printed Lawn", "lawn", "100% cotton lawn"),
  fabric("c", "Woven Cotton", "Cotton", "100% cotton"),
  fabric("d", "Silk Chiffon", " silk ", "100% silk chiffon"),
  fabric("e", "Mystery", null),
];
const stock: Record<string, number> = { a: 70, b: 4, c: 0, d: 12, e: -1 };
const metres = (id: string) => stock[id] ?? 0;

describe("fabricMaterial", () => {
  it("reads the fibre property, trimmed and lower-cased", () => {
    expect(fabricMaterial(fabric("x", "X", " Silk "))).toBe("silk");
  });
  it("is null when the feed has no usable fibre", () => {
    expect(fabricMaterial(fabric("x", "X", null))).toBeNull();
    expect(fabricMaterial(fabric("x", "X", "  "))).toBeNull();
    expect(fabricMaterial(fabric("x", "X", 3))).toBeNull();
  });
});

describe("availabilityOf", () => {
  it("is out of stock at or below zero", () => {
    expect(availabilityOf(0)).toBe("out_of_stock");
    expect(availabilityOf(-2)).toBe("out_of_stock");
  });
  it("is low stock under 10 metres", () => {
    expect(availabilityOf(9.5)).toBe("low_stock");
  });
  it("is in stock from 10 metres", () => {
    expect(availabilityOf(10)).toBe("in_stock");
  });
});

describe("materialOptions", () => {
  it("lists each material once, alphabetically, with counts; skips fabrics without one", () => {
    expect(materialOptions(fabrics)).toEqual([
      { value: "cotton", label: "Cotton", count: 1 },
      { value: "lawn", label: "Lawn", count: 1 },
      { value: "silk", label: "Silk", count: 2 },
    ]);
  });
});

describe("availabilityOptions", () => {
  it("lists every state in a fixed order with counts, including zero", () => {
    expect(availabilityOptions(fabrics, metres)).toEqual([
      { value: "in_stock", label: "In stock", count: 2 },
      { value: "low_stock", label: "Low stock", count: 1 },
      { value: "out_of_stock", label: "Out of stock", count: 2 },
    ]);
    expect(availabilityOptions([fabrics[0]], metres)).toEqual([
      { value: "in_stock", label: "In stock", count: 1 },
      { value: "low_stock", label: "Low stock", count: 0 },
      { value: "out_of_stock", label: "Out of stock", count: 0 },
    ]);
  });
});

describe("filterFabrics", () => {
  const ids = (list: { id: string }[]) => list.map((f) => f.id);

  it("returns everything with no filters", () => {
    expect(ids(filterFabrics(fabrics, NO_FILTERS, metres))).toEqual(["a", "b", "c", "d", "e"]);
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });
  it("filters by material", () => {
    expect(ids(filterFabrics(fabrics, { ...NO_FILTERS, material: "silk" }, metres))).toEqual(["a", "d"]);
  });
  it("filters by availability", () => {
    expect(ids(filterFabrics(fabrics, { ...NO_FILTERS, availability: "out_of_stock" }, metres))).toEqual(["c", "e"]);
  });
  it("combines search, material and availability", () => {
    const filters = { query: "chiffon", material: "silk", availability: "in_stock" as const };
    expect(ids(filterFabrics(fabrics, filters, metres))).toEqual(["d"]);
    expect(hasFilters(filters)).toBe(true);
    expect(ids(filterFabrics(fabrics, { ...filters, availability: "low_stock" }, metres))).toEqual([]);
  });
  it("searches name and composition, ignoring case and spaces", () => {
    expect(ids(filterFabrics(fabrics, { ...NO_FILTERS, query: "  COTTON " }, metres))).toEqual(["b", "c"]);
  });
});
