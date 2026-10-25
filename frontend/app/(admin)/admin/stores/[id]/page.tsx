import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listFabricsAction } from "@/app/(storefront)/catalog-actions";
import { Alert } from "@/components/ui/alert";
import { HeadingRule } from "@/components/ui/heading";
import { getSupplierForAdmin } from "@/lib/admin-catalog";
import { StoreFabrics } from "./store-fabrics";

export const metadata: Metadata = { title: "Store fabrics" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = UUID.test(id) ? await getSupplierForAdmin(id) : null;
  if (!supplier) notFound();
  // Admin session: RLS returns every fabric of this store, hidden or not.
  const result = await listFabricsAction({ supplierId: supplier.id });

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
        {result.ok ? (
          <StoreFabrics supplierId={supplier.id} fabrics={result.data} />
        ) : (
          <Alert tone="danger">We couldn&apos;t load this store&apos;s fabrics. Please refresh.</Alert>
        )}
      </div>
    </div>
  );
}
