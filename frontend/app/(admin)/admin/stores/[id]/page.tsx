import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFabricStockAction, listFabricsAction } from "@/app/(storefront)/catalog-actions";
import { getSupplierIntegration } from "@multife/backend/modules/suppliers/getSupplierIntegration";
import { listSupplierContacts } from "@multife/backend/modules/suppliers/listSupplierContacts";
import { StoreConnectionCard } from "@/components/admin/store-connection-card";
import { StoreContactsCard } from "@/components/admin/store-contacts-card";
import { StorefrontCard } from "@/components/admin/storefront-card";
import { logMessage } from "@/lib/describe-error";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { HeadingRule } from "@/components/ui/heading";
import { getSupplierForAdmin } from "@/lib/admin-catalog";
import { storefrontUrl } from "@/lib/storefront";
import { StoreFabrics } from "./store-fabrics";

export const metadata: Metadata = { title: "Store fabrics" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = UUID.test(id) ? await getSupplierForAdmin(id) : null;
  if (!supplier) notFound();
  // Admin session: RLS returns every fabric of this store, hidden or not.
  const result = await listFabricsAction({ supplierId: supplier.id });
  const stock = result.ok ? await getFabricStockAction({ fabricIds: result.data.map((f) => f.id) }) : null;
  const supabase = await createClient();
  const [integration, contacts] = await Promise.all([
    getSupplierIntegration(supabase, supplier.id).catch((error) => {
      console.error("getSupplierIntegration failed:", logMessage(error));
      return undefined;
    }),
    listSupplierContacts(supabase, supplier.id).catch((error) => {
      console.error("listSupplierContacts failed:", logMessage(error));
      return undefined;
    }),
  ]);

  return (
    <div>
      <Link href="/admin/stores" className="text-sm font-semibold text-ocean hover:underline">
        ← All stores
      </Link>
      <div className="mt-3 max-w-2xl">
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{supplier.name}</h1>
        <HeadingRule align="left" className="mt-4" />
        <p className="mt-4 text-base leading-7 text-muted">
          Confirm each fabric&apos;s customizations, then make it available. A fabric can only be offered to
          customers once at least one customization is confirmed.
        </p>
      </div>
      <div className="mt-8">
        <StorefrontCard storeId={supplier.id} slug={supplier.slug} url={storefrontUrl(supplier.slug)} live={supplier.status === "active"} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        {integration === undefined ? (
          <Alert tone="danger">We couldn&apos;t load this store&apos;s connection settings. Please refresh.</Alert>
        ) : (
          <StoreConnectionCard storeId={supplier.id} integration={integration} />
        )}
        {contacts === undefined ? (
          <Alert tone="danger">We couldn&apos;t load this store&apos;s contacts. Please refresh.</Alert>
        ) : (
          <StoreContactsCard storeId={supplier.id} contacts={contacts} />
        )}
      </div>
      <div className="mt-8">
        {result.ok ? (
          <StoreFabrics supplierId={supplier.id} fabrics={result.data} stock={stock?.ok ? stock.data : {}} />
        ) : (
          <Alert tone="danger">We couldn&apos;t load this store&apos;s fabrics. Please refresh.</Alert>
        )}
      </div>
    </div>
  );
}
