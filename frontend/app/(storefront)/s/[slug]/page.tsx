import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandBanner, BrandLogo } from "@/components/order/brand-mark";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { BRANDS, brandFabrics, getBrand } from "@/lib/catalog";
import { FabricLibrary } from "./fabric-library";

export function generateStaticParams() {
  return BRANDS.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const brand = getBrand((await params).slug);
  return { title: brand ? `${brand.name} fabrics` : "Store not found" };
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const brand = getBrand((await params).slug);
  if (!brand) notFound();
  const fabrics = brandFabrics(brand);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <OrderTopBar backHref="/#brands" backLabel="Back to brands" />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
            <BrandBanner bannerUrl={brand.bannerUrl} className="h-28 sm:h-40" />
            <div className="flex flex-col gap-4 px-5 pb-6 sm:flex-row sm:items-end sm:justify-between sm:px-8">
              <div className="flex items-end gap-4">
                <BrandLogo name={brand.name} logoUrl={brand.logoUrl} className="-mt-10 h-20 w-20 sm:-mt-12 sm:h-24 sm:w-24" />
                <div className="pb-1">
                  <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{brand.name}</h1>
                  <p className="mt-1 text-sm text-muted">{fabrics.length} fabrics available</p>
                </div>
              </div>
              <span className="self-start rounded-full bg-success-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-success sm:self-auto">
                New
              </span>
            </div>
          </div>
        </section>

        <FabricLibrary brandSlug={brand.slug} fabrics={fabrics} />
      </main>
    </div>
  );
}
