import type { SupplierCapabilities } from "@multife/backend/modules/suppliers/types";

// Supplier panel (SDS §2.1: fabric list, sync status, supply requirements).
// Pure helpers, no I/O: the server reads live rows in lib/supplier-panel.ts and
// shapes them here. A supplier contact only ever sees fabric, metres and dates —
// never customer identity, measurements or what MultiFe charged (FR-AUTH-07).

// Below this many metres left to sell, a fabric on sale is flagged "Low stock"
// (roughly two outfits' worth at the demo templates' yardage).
export const LOW_STOCK_METRES = 10;

// Demo catalogue rows (npm run seed:demo) carry this external_id prefix. Phase 1
// runs on that placeholder data by client decision, and the panel says so.
export const PLACEHOLDER_EXTERNAL_PREFIX = "DEMO-";

export type PanelFabric = {
  id: string;
  externalId: string;
  name: string;
  composition: string | null;
  pricePerMetre: number;
  // Roll on hand; drops only at cutting.
  stockMetres: number;
  // Held for placed orders and checkouts in progress.
  heldMetres: number;
  // What customers can still order: stock minus held.
  availableMetres: number;
  isAvailable: boolean;
  isHidden: boolean;
  image: string | null;
  lastSyncedAt: string | null;
};

export type FabricStatus = "on_sale" | "low_stock" | "out_of_stock" | "awaiting_setup" | "hidden";

// One status per fabric, most important first: hidden by MultiFe, not yet set
// up for ordering (customizations unconfirmed, FR-TPL-10), then stock.
export function fabricStatus(f: Pick<PanelFabric, "isHidden" | "isAvailable" | "availableMetres">): FabricStatus {
  if (f.isHidden) return "hidden";
  if (!f.isAvailable) return "awaiting_setup";
  if (f.availableMetres <= 0) return "out_of_stock";
  if (f.availableMetres < LOW_STOCK_METRES) return "low_stock";
  return "on_sale";
}

export const FABRIC_STATUS_LABELS: Record<FabricStatus, string> = {
  on_sale: "On sale",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  awaiting_setup: "Being set up",
  hidden: "Hidden by MultiFe",
};

export const isPlaceholderFabric = (f: Pick<PanelFabric, "externalId">) =>
  f.externalId.startsWith(PLACEHOLDER_EXTERNAL_PREFIX);

export type FabricSummary = {
  total: number;
  onSale: number; // includes low stock: still orderable
  lowStock: number;
  outOfStock: number;
  notOnSale: number; // hidden or being set up
  stockMetres: number;
  heldMetres: number;
};

export function summariseFabrics(fabrics: PanelFabric[]): FabricSummary {
  const summary: FabricSummary = {
    total: fabrics.length,
    onSale: 0,
    lowStock: 0,
    outOfStock: 0,
    notOnSale: 0,
    stockMetres: 0,
    heldMetres: 0,
  };
  for (const f of fabrics) {
    const status = fabricStatus(f);
    if (status === "on_sale" || status === "low_stock") summary.onSale += 1;
    if (status === "low_stock") summary.lowStock += 1;
    if (status === "out_of_stock") summary.outOfStock += 1;
    if (status === "hidden" || status === "awaiting_setup") summary.notOnSale += 1;
    summary.stockMetres += f.stockMetres;
    summary.heldMetres += f.heldMetres;
  }
  summary.stockMetres = round2(summary.stockMetres);
  summary.heldMetres = round2(summary.heldMetres);
  return summary;
}

// A row of supplier_fabric_reservation_summary: totals per fabric, kind and
// status — no order, customer or price columns exist on the view.
export type ReservationSummaryRow = {
  fabric_id: string;
  kind: "soft" | "hard";
  status: "active" | "released" | "expired" | "converted";
  metres: number | string;
  reservation_count: number | string;
};

export type FabricRequirement = {
  fabricId: string;
  name: string;
  externalId: string;
  image: string | null;
  // Hard holds on placed orders not yet cut: fabric that must be supplied.
  forOrdersMetres: number;
  forOrdersCount: number;
  // Live checkout holds (~20 min), which may still turn into orders.
  inCheckoutMetres: number;
  // Hard holds closed at cutting: fabric already used.
  cutMetres: number;
  cutCount: number;
  stockMetres: number;
};

export type RequirementTotals = { forOrdersMetres: number; forOrdersCount: number; inCheckoutMetres: number; cutMetres: number; cutCount: number };

// Builds the "Fabric needed" list. Active soft holds in the view may include
// lapsed ones (the expiry job isn't built), so checkout holds come from
// fn_fabric_stock's reserved total (hard + unexpired soft) minus the hard holds.
export function buildRequirements(
  fabrics: PanelFabric[],
  rows: ReservationSummaryRow[],
): { items: FabricRequirement[]; totals: RequirementTotals } {
  const byFabric = new Map<string, { hardActive: number; hardActiveCount: number; cut: number; cutCount: number }>();
  for (const row of rows) {
    if (row.kind !== "hard") continue;
    const entry = byFabric.get(row.fabric_id) ?? { hardActive: 0, hardActiveCount: 0, cut: 0, cutCount: 0 };
    if (row.status === "active") {
      entry.hardActive += Number(row.metres);
      entry.hardActiveCount += Number(row.reservation_count);
    } else if (row.status === "converted") {
      entry.cut += Number(row.metres);
      entry.cutCount += Number(row.reservation_count);
    }
    byFabric.set(row.fabric_id, entry);
  }

  const items: FabricRequirement[] = [];
  for (const f of fabrics) {
    const e = byFabric.get(f.id) ?? { hardActive: 0, hardActiveCount: 0, cut: 0, cutCount: 0 };
    const inCheckout = Math.max(f.heldMetres - e.hardActive, 0);
    if (e.hardActive <= 0 && inCheckout <= 0 && e.cut <= 0) continue;
    items.push({
      fabricId: f.id,
      name: f.name,
      externalId: f.externalId,
      image: f.image,
      forOrdersMetres: round2(e.hardActive),
      forOrdersCount: e.hardActiveCount,
      inCheckoutMetres: round2(inCheckout),
      cutMetres: round2(e.cut),
      cutCount: e.cutCount,
      stockMetres: f.stockMetres,
    });
  }

  items.sort(
    (a, b) => b.forOrdersMetres - a.forOrdersMetres || b.inCheckoutMetres - a.inCheckoutMetres || b.cutMetres - a.cutMetres || a.name.localeCompare(b.name),
  );

  const totals = items.reduce<RequirementTotals>(
    (t, i) => ({
      forOrdersMetres: t.forOrdersMetres + i.forOrdersMetres,
      forOrdersCount: t.forOrdersCount + i.forOrdersCount,
      inCheckoutMetres: t.inCheckoutMetres + i.inCheckoutMetres,
      cutMetres: t.cutMetres + i.cutMetres,
      cutCount: t.cutCount + i.cutCount,
    }),
    { forOrdersMetres: 0, forOrdersCount: 0, inCheckoutMetres: 0, cutMetres: 0, cutCount: 0 },
  );
  totals.forOrdersMetres = round2(totals.forOrdersMetres);
  totals.inCheckoutMetres = round2(totals.inCheckoutMetres);
  totals.cutMetres = round2(totals.cutMetres);

  return { items, totals };
}

export { readCapabilities, type SupplierCapabilities } from "@multife/backend/modules/suppliers/types";

// Worded for the store person reading their own panel.
export const CAPABILITY_LABELS: [key: keyof SupplierCapabilities, label: string][] = [
  ["catalogue_read", "Fabric catalogue"],
  ["stock_read", "Live stock"],
  ["order_write", "Fabric orders sent to your system"],
  ["status_callback", "Supply updates from your system"],
];

// Case-insensitive search over the fields a store person would type: name,
// their own code (external id) and composition.
export function filterFabrics<T extends Pick<PanelFabric, "name" | "externalId" | "composition">>(fabrics: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return fabrics;
  return fabrics.filter((f) => `${f.name} ${f.externalId} ${f.composition ?? ""}`.toLowerCase().includes(q));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
