import type { SupabaseClient } from "@supabase/supabase-js";

// Supplier integration settings (SDS §9.1, FR-FAB-13, FR-ADM-03). Hand-declared
// row shapes, same convention as modules/catalog/types.ts.
export type AnySupabaseClient = SupabaseClient;

// The four things a store's system may be able to do. The platform reads
// these before deciding how to behave for that store (SDS §9.1).
export interface SupplierCapabilities {
  catalogue_read: boolean;
  stock_read: boolean;
  order_write: boolean;
  status_callback: boolean;
}

export const CAPABILITY_KEYS = ["catalogue_read", "stock_read", "order_write", "status_callback"] as const;

// supplier_integrations.provider_kind: how the store's catalogue reaches
// MultiFe. Phase 1 runs on placeholder data (client decision), so no store
// API adapter exists yet; "api" records that one is expected.
export const PROVIDER_KINDS = ["placeholder", "manual", "csv_import", "api"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const PROVIDER_KIND_LABELS: Record<ProviderKind, string> = {
  placeholder: "Placeholder data (demo)",
  manual: "Entered by MultiFe",
  csv_import: "Spreadsheet import",
  api: "Store's system (API)",
};

export const providerKindLabel = (kind: string) =>
  (PROVIDER_KIND_LABELS as Record<string, string>)[kind] ?? kind;

export type IntegrationStatus = "pending" | "active" | "error";

// Admin view of a store's integration. credentials_ref is deliberately not
// part of it: credentials never leave server code (FR-FAB-14, NFR-SEC-08).
export interface SupplierIntegration {
  supplierId: string;
  providerKind: string;
  baseUrl: string | null;
  capabilities: SupplierCapabilities;
  status: IntegrationStatus;
  lastSyncAt: string | null;
  updatedAt: string;
}

export interface SupplierContact {
  userId: string;
  fullName: string | null;
  email: string | null;
  status: "active" | "suspended";
  linkedAt: string;
}

// jsonb is free-form; only real true values count as a capability.
export function readCapabilities(raw: unknown): SupplierCapabilities {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    catalogue_read: obj.catalogue_read === true,
    stock_read: obj.stock_read === true,
    order_write: obj.order_write === true,
    status_callback: obj.status_callback === true,
  };
}
