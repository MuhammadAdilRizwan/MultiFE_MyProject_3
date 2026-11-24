import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { isFabricPublishable } from "@multife/backend/modules/catalog/isFabricPublishable";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { PageTitle } from "@/components/order/page-title";
import { estimateOrderFrom, fabricName, fabricProperties, formatMetres, formatPKR } from "@/lib/catalog";
import { getActiveBrandBySlug } from "@/lib/suppliers";
import { getFabricAction, getFabricStockAction, getTemplateFitAction, listCompatibleTemplatesForFabricAction } from "@/app/(storefront)/catalog-actions";
import { ContinueToTemplates } from "./continue-to-templates";

type Params = { slug: string; fabricId: string };

// The brand's fabric, only while a customer could actually order it.
async function loadFabric({ slug, fabricId }: Params) {
  const brand = await getActiveBrandBySlug(slug);
  if (!brand || !/^[0-9a-f-]{36}$/i.test(fabricId)) return null;
  const result = await getFabricAction({ fabricId });
  if (!result.ok) return null;
  const fabric = result.data;
  if (fabric.supplier_id !== brand.id || !fabric.is_available || fabric.is_hidden) return null;
  return { brand, fabric };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const loaded = await loadFabric(await params);
  return { title: loaded ? `${fabricName(loaded.fabric)} fabric` : "Fabric not found" };
}

export default async function FabricDetailPage({ params }: { params: Promise<Params> }) {
  const loaded = await loadFabric(await params);
  if (!loaded) notFound();
  const { brand, fabric } = loaded;
  const name = fabricName(fabric);
  const cover = fabric.images[0]?.url ?? null;

  // What's left after fabric held for other orders; falls back to the roll on
  // hand if the lookup fails (the reservation at checkout re-checks anyway).
  const stockResult = await getFabricStockAction({ fabricIds: [fabric.id] });
  const available = (stockResult.ok ? stockResult.data[fabric.id]?.availableMetres : undefined) ?? fabric.stock_metres;
  const soldOut = available <= 0;

  const confirmed = isFabricPublishable(fabric);
  const templatesResult = confirmed ? await listCompatibleTemplatesForFabricAction({ fabricId: fabric.id }) : null;
  const compatible = templatesResult?.ok ? templatesResult.data.filter((t) => t.is_published) : [];
  // FR-FAB-17: only outfits there's enough of this fabric left for (in the
  // customer's saved size, else the standard size). If the check fails,
  // nothing is hidden: the fabric hold at checkout re-checks.
  const fitResult = compatible.length > 0 && !soldOut ? await getTemplateFitAction({ fabricId: fabric.id }) : null;
  const fit = fitResult?.ok ? fitResult.data : null;
  const templates = compatible.filter((t) => fit?.fits[t.id]?.enough !== false);
  const tooShort = compatible.length > 0 && templates.length === 0;

  const stitchingFrom = templates.length > 0 ? Math.min(...templates.map((t) => t.base_stitch_price)) : null;
  const estimates = templates.map((t) => estimateOrderFrom(t, fabric)).filter((e) => e !== null);
  const orderFrom = estimates.length > 0 ? Math.min(...estimates.map((e) => e.total)) : null;

  const rows: [string, string][] = [
    ["Fabric price", `${formatPKR(fabric.price_per_metre)} / metre`],
    ["In stock", soldOut ? "Out of stock" : formatMetres(available)],
    ...(fabric.composition ? ([["Composition", fabric.composition]] as [string, string][]) : []),
    ...(stitchingFrom !== null ? ([["Custom stitching from", formatPKR(stitchingFrom)]] as [string, string][]) : []),
  ];
  const properties = fabricProperties(fabric);

  const blocked = soldOut
    ? "This fabric is out of stock right now. Please choose another fabric."
    : !confirmed
    ? "Customizations for this fabric are being confirmed with the store. Please check back soon."
    : templatesResult && !templatesResult.ok
      ? "We couldn't load the outfit templates. Please refresh to try again."
      : tooShort
        ? `There isn't enough of this fabric left for any of our outfits${fit?.basis === "saved" ? " in your size" : ""}. Please choose another fabric.`
        : templates.length === 0
          ? "No outfit templates can be made in this fabric yet."
          : null;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <OrderTopBar backHref={`/s/${brand.slug}`} backLabel={`Back to ${brand.name} fabrics`} storeName={brand.name} />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <PageTitle
            label="Fabric detail"
            title={name}
            subtitle="Review fabric pricing before moving to templates and style selection."
          />

          <div className="mt-8 grid overflow-hidden rounded-3xl border border-line bg-white shadow-card lg:grid-cols-2">
            <div className="relative flex aspect-[4/3] items-center justify-center bg-cream lg:aspect-auto lg:min-h-[28rem]">
              {cover ? (
                <Image src={cover} alt={`${name} fabric close-up`} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
              ) : (
                <span aria-hidden="true" className="font-display text-7xl text-hint">
                  {name.charAt(0)}
                </span>
              )}
              <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/60 bg-white/85 px-4 py-3 backdrop-blur">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ocean">Selected fabric</p>
                <p className="font-display text-2xl leading-tight text-ink">{name}</p>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              <dl className="divide-y divide-line border-y border-line">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-bold text-ink">{v}</dd>
                  </div>
                ))}
                {orderFrom !== null && (
                  <div className="flex items-center justify-between gap-4 py-4">
                    <dt className="text-sm font-bold text-ink">Estimated order from</dt>
                    <dd className="text-right text-lg font-extrabold text-ocean">{formatPKR(orderFrom)}</dd>
                  </div>
                )}
              </dl>

              {properties.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-sm font-bold text-ink">Fabric properties</h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {properties.map((p) => (
                      <li key={p.key} className="rounded-full bg-cyan-bright/10 px-3 py-1.5 text-xs font-semibold text-ocean">
                        {p.label}: {p.value}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mt-5 text-xs leading-5 text-hint">
                Final fabric quantity and price are recalculated from your measurements and shown before you pay.
              </p>
            </div>
          </div>
        </section>
      </main>
      <ContinueToTemplates brandSlug={brand.slug} fabricId={fabric.id} blocked={blocked} />
    </div>
  );
}
