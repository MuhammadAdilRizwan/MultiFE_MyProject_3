import { readCapabilities, type AnySupabaseClient, type SupplierIntegration } from "./types";

const COLUMNS = "supplier_id, provider_kind, base_url, capabilities, status, last_sync_at, updated_at";

type Raw = {
  supplier_id: string;
  provider_kind: string;
  base_url: string | null;
  capabilities: unknown;
  status: SupplierIntegration["status"];
  last_sync_at: string | null;
  updated_at: string;
};

export function toIntegration(row: Raw): SupplierIntegration {
  return {
    supplierId: row.supplier_id,
    providerKind: row.provider_kind,
    baseUrl: row.base_url,
    capabilities: readCapabilities(row.capabilities),
    status: row.status,
    lastSyncAt: row.last_sync_at,
    updatedAt: row.updated_at,
  };
}

// A store's integration settings, or null when none are configured yet.
// Admin session ("supplier_integrations: admin all"); credentials_ref is never
// selected, so it can't reach a page (FR-FAB-14).
export async function getSupplierIntegration(
  supabase: AnySupabaseClient,
  supplierId: string,
): Promise<SupplierIntegration | null> {
  const { data, error } = await supabase
    .from("supplier_integrations")
    .select(COLUMNS)
    .eq("supplier_id", supplierId)
    .maybeSingle();
  if (error) throw error;
  return data ? toIntegration(data as Raw) : null;
}

export const INTEGRATION_COLUMNS = COLUMNS;
export type IntegrationRaw = Raw;
