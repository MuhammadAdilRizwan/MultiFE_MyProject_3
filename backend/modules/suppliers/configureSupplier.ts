import { CatalogError } from "../catalog/errors";
import { getSupplierIntegration, INTEGRATION_COLUMNS, toIntegration, type IntegrationRaw } from "./getSupplierIntegration";
import { PROVIDER_KINDS, type AnySupabaseClient, type ProviderKind, type SupplierCapabilities, type SupplierIntegration } from "./types";

export interface ConfigureSupplierParams {
  supplierId: string;
  providerKind: ProviderKind;
  baseUrl?: string | null;
  capabilities: SupplierCapabilities;
}

// configureSupplier (SDS §11.1, FR-ADM-03, FR-FAB-13): an admin records how a
// store connects to MultiFe and what its system can do. One row per store,
// upserted on supplier_id. Status and last sync belong to the sync job, so they
// are left as they are (a new row starts "pending"). Credentials are not taken
// here: they live in a secret store, referenced by credentials_ref, and no
// Phase 1 connector uses one.
//
// Runs on the admin's session client — RLS "supplier_integrations: admin all"
// is the real gate. Returns the settings before and after, for the audit log.
export async function configureSupplier(
  supabase: AnySupabaseClient,
  params: ConfigureSupplierParams,
): Promise<{ before: SupplierIntegration | null; after: SupplierIntegration }> {
  if (!PROVIDER_KINDS.includes(params.providerKind)) {
    throw new CatalogError("invalid_supplier_integration", "Unknown connection type.");
  }
  const baseUrl = params.baseUrl?.trim() || null;
  if (baseUrl && !isHttpsUrl(baseUrl)) {
    throw new CatalogError("invalid_supplier_integration", "The store's API address must be a full https:// link.");
  }

  const before = await getSupplierIntegration(supabase, params.supplierId);

  const { data, error } = await supabase
    .from("supplier_integrations")
    .upsert(
      {
        supplier_id: params.supplierId,
        provider_kind: params.providerKind,
        base_url: baseUrl,
        capabilities: {
          catalogue_read: params.capabilities.catalogue_read === true,
          stock_read: params.capabilities.stock_read === true,
          order_write: params.capabilities.order_write === true,
          status_callback: params.capabilities.status_callback === true,
        },
      },
      { onConflict: "supplier_id" },
    )
    .select(INTEGRATION_COLUMNS)
    .single();
  if (error) throw error;

  return { before, after: toIntegration(data as IntegrationRaw) };
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".") && !url.username && !url.password;
  } catch {
    return false;
  }
}
