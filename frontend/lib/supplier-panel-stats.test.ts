import { describe, expect, it } from "vitest";
import {
  buildRequirements,
  fabricStatus,
  filterFabrics,
  isPlaceholderFabric,
  LOW_STOCK_METRES,
  readCapabilities,
  summariseFabrics,
  type PanelFabric,
  type ReservationSummaryRow,
} from "./supplier-panel-stats";

function fabric(overrides: Partial<PanelFabric> = {}): PanelFabric {
  return {
    id: "f1",
    externalId: "DEMO-KHA-01",
    name: "Lawn Print",
    composition: "100% cotton",
    pricePerMetre: 900,
    stockMetres: 100,
    heldMetres: 0,
    availableMetres: 100,
    isAvailable: true,
    isHidden: false,
    image: null,
    lastSyncedAt: null,
    ...overrides,
  };
}

describe("fabricStatus", () => {
  it("puts hidden first, then not set up, then stock", () => {
    expect(fabricStatus(fabric({ isHidden: true, isAvailable: false, availableMetres: 0 }))).toBe("hidden");
    expect(fabricStatus(fabric({ isAvailable: false, availableMetres: 0 }))).toBe("awaiting_setup");
    expect(fabricStatus(fabric({ availableMetres: 0 }))).toBe("out_of_stock");
    expect(fabricStatus(fabric({ availableMetres: LOW_STOCK_METRES - 0.5 }))).toBe("low_stock");
    expect(fabricStatus(fabric({ availableMetres: LOW_STOCK_METRES }))).toBe("on_sale");
  });
});

describe("summariseFabrics", () => {
  it("counts each fabric once and sums metres", () => {
    const summary = summariseFabrics([
      fabric({ id: "a", stockMetres: 50.5, heldMetres: 3.25 }),
      fabric({ id: "b", availableMetres: 4, stockMetres: 10, heldMetres: 6 }),
      fabric({ id: "c", availableMetres: 0, stockMetres: 5, heldMetres: 5 }),
      fabric({ id: "d", isAvailable: false }),
      fabric({ id: "e", isHidden: true }),
    ]);
    expect(summary).toEqual({
      total: 5,
      onSale: 2,
      lowStock: 1,
      outOfStock: 1,
      notOnSale: 2,
      stockMetres: 265.5,
      heldMetres: 14.25,
    });
  });

  it("handles a store with no fabrics", () => {
    expect(summariseFabrics([]).total).toBe(0);
  });
});

describe("buildRequirements", () => {
  const rows: ReservationSummaryRow[] = [
    { fabric_id: "a", kind: "hard", status: "active", metres: "6.5", reservation_count: 2 },
    { fabric_id: "a", kind: "hard", status: "converted", metres: 3, reservation_count: "1" },
    { fabric_id: "a", kind: "soft", status: "active", metres: 99, reservation_count: 9 }, // may be lapsed: ignored
    { fabric_id: "a", kind: "hard", status: "released", metres: 4, reservation_count: 1 }, // cancelled: ignored
    { fabric_id: "b", kind: "hard", status: "converted", metres: 2.5, reservation_count: 1 },
  ];

  it("splits orders, live checkouts and cut fabric per fabric", () => {
    const { items, totals } = buildRequirements(
      [
        fabric({ id: "a", name: "Silk", heldMetres: 9 }), // 6.5 hard + 2.5 live soft
        fabric({ id: "b", name: "Lawn", heldMetres: 0 }),
        fabric({ id: "c", name: "Khaddar", heldMetres: 0 }), // nothing: left out
      ],
      rows,
    );
    expect(items.map((i) => i.fabricId)).toEqual(["a", "b"]);
    expect(items[0]).toMatchObject({ forOrdersMetres: 6.5, forOrdersCount: 2, inCheckoutMetres: 2.5, cutMetres: 3, cutCount: 1 });
    expect(items[1]).toMatchObject({ forOrdersMetres: 0, inCheckoutMetres: 0, cutMetres: 2.5, cutCount: 1 });
    expect(totals).toEqual({ forOrdersMetres: 6.5, forOrdersCount: 2, inCheckoutMetres: 2.5, cutMetres: 5.5, cutCount: 2 });
  });

  it("shows a fabric held only by a live checkout", () => {
    const { items } = buildRequirements([fabric({ id: "z", heldMetres: 4 })], []);
    expect(items[0]).toMatchObject({ forOrdersMetres: 0, inCheckoutMetres: 4 });
  });

  it("never reports a negative checkout hold", () => {
    const { items } = buildRequirements([fabric({ id: "a", heldMetres: 1 })], rows);
    expect(items[0].inCheckoutMetres).toBe(0);
  });
});

describe("readCapabilities", () => {
  it("accepts only real true values", () => {
    expect(readCapabilities({ catalogue_read: true, stock_read: "true", order_write: 1 })).toEqual({
      catalogue_read: true,
      stock_read: false,
      order_write: false,
      status_callback: false,
    });
    expect(readCapabilities(null).catalogue_read).toBe(false);
  });
});

describe("filterFabrics / isPlaceholderFabric", () => {
  const list = [fabric({ id: "a", name: "Silk Chiffon", externalId: "KH-22" }), fabric({ id: "b", name: "Lawn", composition: "Cotton blend" })];

  it("matches name, code and composition, case-insensitively", () => {
    expect(filterFabrics(list, "chiffon").map((f) => f.id)).toEqual(["a"]);
    expect(filterFabrics(list, "kh-22").map((f) => f.id)).toEqual(["a"]);
    expect(filterFabrics(list, "BLEND").map((f) => f.id)).toEqual(["b"]);
    expect(filterFabrics(list, "  ")).toHaveLength(2);
  });

  it("recognises demo catalogue rows", () => {
    expect(isPlaceholderFabric({ externalId: "DEMO-KHA-01" })).toBe(true);
    expect(isPlaceholderFabric({ externalId: "KH-22" })).toBe(false);
  });
});
