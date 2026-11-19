import "server-only";
import { getFabricStock, type FabricStock } from "@multife/backend/modules/catalog/getFabricStock";
import { createClient } from "@/lib/supabase/server";
import { readCapabilities, type SupplierCapabilities } from "@multife/backend/modules/suppliers/types";
import type { PanelFabric, ReservationSummaryRow } from "@/lib/supplier-panel-stats";

// Reads for the supplier panel (/supplier). Session client only, so RLS scopes
// every row to the contact's own store: "supplier_contacts: read own row",
// "suppliers: contact reads own", "fabrics: contact reads own supplier",
// supplier_fabric_reservation_summary and supplier_integration_status_view
// (no credentials). Nothing here can reach orders, customers, measurements or
// prices MultiFe charged (FR-AUTH-07, SDS §12.2).

export type MyStore = {
  id: string;
  name: string;
  slug: string;
  status: "pending" | "active" | "suspended";
  logoUrl: string | null;
  bannerUrl: string | null;
};

export type StoreConnection = {
  providerKind: string;
  status: "pending" | "active" | "error";
  capabilities: SupplierCapabilities;
  lastSyncAt: string | null;
};

export type SyncRun = {
  kind: string;
  startedAt: string;
  finishedAt: string | null;
  created: number;
  updated: number;
  failed: number;
  hasError: boolean;
};

// The store this signed-in contact belongs to, or null (not linked yet).
export async function getMyStore(): Promise<MyStore | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: link, error: linkError } = await supabase
    .from("supplier_contacts")
    .select("supplier_id")
    .eq("user_id", auth.user.id)
    .limit(1)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) return null;

  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, slug, status, logo_url, banner_url")
    .eq("id", link.supplier_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    status: data.status,
    logoUrl: data.logo_url,
    bannerUrl: data.banner_url,
  };
}

type FabricQueryRow = {
  id: string;
  external_id: string;
  name: string;
  display_name: string | null;
  composition: string | null;
  price_per_metre: number | string;
  stock_metres: number | string;
  is_available: boolean;
  is_hidden: boolean;
  last_synced_at: string | null;
  images: { url: string; sort: number }[] | null;
};

// Every fabric of the store, hidden or not, with what's held for orders.
export async function listMyFabrics(storeId: string): Promise<PanelFabric[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fabrics")
    .select(
      "id, external_id, name, display_name, composition, price_per_metre, stock_metres, is_available, is_hidden, last_synced_at, images:fabric_images(url, sort)",
    )
    .eq("supplier_id", storeId)
    .order("name", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as FabricQueryRow[];
  if (rows.length === 0) return [];

  // fn_fabric_stock caps at 500 ids per call.
  const stock = new Map<string, FabricStock>();
  for (let i = 0; i < rows.length; i += 500) {
    const part = await getFabricStock(supabase, rows.slice(i, i + 500).map((r) => r.id));
    for (const [id, value] of part) stock.set(id, value);
  }

  return rows.map((r) => {
    const s = stock.get(r.id);
    const stockMetres = Number(r.stock_metres);
    const images = [...(r.images ?? [])].sort((a, b) => a.sort - b.sort);
    return {
      id: r.id,
      externalId: r.external_id,
      name: r.display_name || r.name,
      composition: r.composition,
      pricePerMetre: Number(r.price_per_metre),
      stockMetres,
      heldMetres: s?.reservedMetres ?? 0,
      availableMetres: s?.availableMetres ?? stockMetres,
      isAvailable: r.is_available,
      isHidden: r.is_hidden,
      image: images[0]?.url ?? null,
      lastSyncedAt: r.last_synced_at,
    };
  });
}

// Totals per fabric, kind and status (the view has no order or customer columns).
export async function listMyReservationSummary(storeId: string): Promise<ReservationSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_fabric_reservation_summary")
    .select("fabric_id, kind, status, metres, reservation_count")
    .eq("supplier_id", storeId);
  if (error) throw error;
  return (data ?? []) as ReservationSummaryRow[];
}

// The store's connection to MultiFe (none in Phase 1: placeholder catalogue)
// and its latest sync runs.
export async function getMyConnection(storeId: string): Promise<{ connection: StoreConnection | null; runs: SyncRun[] }> {
  const supabase = await createClient();
  const [integration, runs] = await Promise.all([
    supabase
      .from("supplier_integration_status_view")
      .select("provider_kind, capabilities, status, last_sync_at")
      .eq("supplier_id", storeId)
      .maybeSingle(),
    supabase
      .from("integration_sync_runs")
      .select("kind, started_at, finished_at, created_count, updated_count, failed_count, error")
      .eq("supplier_id", storeId)
      .order("started_at", { ascending: false })
      .limit(5),
  ]);
  if (integration.error) throw integration.error;
  if (runs.error) throw runs.error;

  const i = integration.data;
  return {
    connection: i
      ? {
          providerKind: i.provider_kind,
          status: i.status,
          capabilities: readCapabilities(i.capabilities),
          lastSyncAt: i.last_sync_at,
        }
      : null,
    // The error text stays out of the panel (it can hold vendor details);
    // the store just sees that a run had a problem.
    runs: (runs.data ?? []).map((r) => ({
      kind: r.kind,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      created: r.created_count,
      updated: r.updated_count,
      failed: r.failed_count,
      hasError: Boolean(r.error),
    })),
  };
}
