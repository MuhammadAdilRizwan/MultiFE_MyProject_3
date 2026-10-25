import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandBanner, BrandLogo } from "@/components/order/brand-mark";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { Alert } from "@/components/ui/alert";
import { getActiveBrandBySlug } from "@/lib/suppliers";
import { listStoreFabricsAction } from "@/app/(storefront)/catalog-actions";
import { FabricLibrary } from "./fabric-library";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const brand = await getActiveBrandBySlug((await params).slug);
  return { title: brand ? `${brand.name} fabrics` : "Store not found" };
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const brand = await getActiveBrandBySlug((await params).slug);
  if (!brand) notFound();
  const result = await listStoreFabricsAction({ supplierId: brand.id });
  const fabrics = result.ok ? result.data : [];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <OrderTopBar backHref="/#brands" backLabel="Back to brands" />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
            <BrandBanner bannerUrl={null} className="h-28 sm:h-40" />
            <div className="flex flex-col gap-4 px-5 pb-6 sm:flex-row sm:items-end sm:justify-between sm:px-8">
              <div className="flex items-end gap-4">
                <BrandLogo name={brand.name} logoUrl={brand.logoUrl} className="-mt-10 h-20 w-20 sm:-mt-12 sm:h-24 sm:w-24" />
                <div className="pb-1">
                  <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{brand.name}</h1>
                  <p className="mt-1 text-sm text-muted">
                    {fabrics.length} {fabrics.length === 1 ? "fabric" : "fabrics"} available
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {result.ok ? (
          <FabricLibrary brandSlug={brand.slug} fabrics={fabrics} />
        ) : (
          <div className="mx-auto max-w-md px-4 py-12">
            <Alert tone="danger">We couldn&apos;t load this store&apos;s fabrics. Please refresh to try again.</Alert>
          </div>
        )}
      </main>
    </div>
  );
}
