import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { PageTitle } from "@/components/order/page-title";
import { BRANDS, brandFabrics, formatPKR, formatYards, getBrand, getFabric } from "@/lib/catalog";
import { ContinueToTemplates } from "./continue-to-templates";

type Params = { slug: string; fabricId: string };

export function generateStaticParams() {
  return BRANDS.flatMap((b) => brandFabrics(b).map((f) => ({ slug: b.slug, fabricId: f.id })));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { fabricId } = await params;
  const fabric = getFabric(fabricId);
  return { title: fabric ? `${fabric.name} fabric` : "Fabric not found" };
}

export default async function FabricDetailPage({ params }: { params: Promise<Params> }) {
  const { slug, fabricId } = await params;
  const brand = getBrand(slug);
  const fabric = brand && brand.fabricIds.includes(fabricId) ? getFabric(fabricId) : undefined;
  if (!brand || !fabric) notFound();

  const fabricTotal = fabric.pricePerYard * fabric.recommendedYards;
  const rows: [string, string][] = [
    ["Fabric price", `${formatPKR(fabric.pricePerYard)} / yard`],
    ["Recommended quantity", formatYards(fabric.recommendedYards)],
    ["Estimated fabric total", formatPKR(fabricTotal)],
    ["Custom stitching from", formatPKR(fabric.stitchingFrom)],
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <OrderTopBar backHref={`/s/${brand.slug}`} backLabel={`Back to ${brand.name} fabrics`} storeName={brand.name} />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <PageTitle
            label="Fabric detail"
            title={`${fabric.name} Fabric`}
            subtitle="Review fabric pricing before moving to templates and style selection."
          />

          <div className="mt-8 grid overflow-hidden rounded-3xl border border-line bg-white shadow-card lg:grid-cols-2">
            <div className="relative aspect-[4/3] bg-cream lg:aspect-auto lg:min-h-[28rem]">
              <Image
                src={fabric.image}
                alt={`${fabric.name} fabric close-up`}
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/85 px-4 py-3 backdrop-blur">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ocean">Selected fabric</p>
                  <p className="font-display text-2xl leading-tight text-ink">{fabric.name}</p>
                </div>
                <span className="rounded-full border border-white/30 bg-mf-blue px-3 py-1.5 text-xs font-bold text-white shadow-blue">
                  {fabric.category}
                </span>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              <p className="text-base leading-7 text-muted">{fabric.description}</p>

              <dl className="mt-6 divide-y divide-line border-y border-line">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-bold text-ink">{v}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 py-4">
                  <dt className="text-sm font-bold text-ink">Estimated order from</dt>
                  <dd className="text-right text-lg font-extrabold text-ocean">
                    {formatPKR(fabricTotal + fabric.stitchingFrom)}
                  </dd>
                </div>
              </dl>

              <div className="mt-6">
                <h2 className="text-sm font-bold text-ink">Best for</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {fabric.bestFor.map((b) => (
                    <li key={b} className="rounded-full bg-cyan-bright/10 px-3 py-1.5 text-xs font-semibold text-ocean">
                      {b}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 rounded-2xl border border-line bg-cream/60 p-4">
                <h2 className="text-sm font-bold text-ink">Care instructions</h2>
                <p className="mt-1 text-sm leading-6 text-muted">{fabric.care}</p>
              </div>

              <p className="mt-5 text-xs leading-5 text-hint">
                Final yardage and price are recalculated from your measurements and shown before you pay.
              </p>
            </div>
          </div>
        </section>
      </main>
      <ContinueToTemplates brandSlug={brand.slug} fabricId={fabric.id} />
    </div>
  );
}
