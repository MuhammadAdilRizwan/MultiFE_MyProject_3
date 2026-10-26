"use client";

import Image from "next/image";
import Link from "next/link";
import { ActionBar, ArrowIcon } from "@/components/order/action-bar";
import { OrderGate } from "@/components/order/order-gate";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { buttonClasses } from "@/components/ui/button";
import { HeadingRule } from "@/components/ui/heading";
import { estimateOrderFrom, fabricName, formatPKR, templateImage } from "@/lib/catalog";

export function TemplatePreview() {
  return (
    <OrderGate needTemplate>
      {({ brand, fabric, template, steps }) => {
        const t = template!;
        const image = templateImage(t.slug);
        const estimate = estimateOrderFrom(t, fabric);
        const facts: [string, string][] = [
          ["Fabric", fabricName(fabric)],
          ["Stitching", formatPKR(t.base_stitch_price)],
          ["Made in", `${t.lead_days} days`],
          ["Estimated from", estimate ? formatPKR(estimate.total) : "After measurements"],
        ];
        const areas = steps.map((s) => s.reviewLabel.toLowerCase());
        return (
          <div className="flex min-h-full flex-1 flex-col">
            <OrderTopBar backHref="/order/template" storeName={brand.name} />
            <main className="flex-1">
              <section className="mx-auto grid max-w-5xl items-center gap-8 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:px-8">
                <div className="relative mx-auto flex aspect-square w-full max-w-md items-center justify-center overflow-hidden rounded-3xl border border-line bg-cream shadow-card lg:max-w-none">
                  {image ? (
                    <Image src={image} alt={t.name} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
                  ) : (
                    <span aria-hidden="true" className="font-display text-8xl text-hint">
                      {t.name.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="text-center lg:text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean">Your template</p>
                  <h1 className="mt-2 font-display text-4xl leading-tight text-ink sm:text-5xl">{t.name}</h1>
                  <HeadingRule align="responsive" className="mt-3" />
                  {t.description && <p className="mt-4 text-base leading-7 text-muted">{t.description}</p>}
                  <dl className="mt-8 grid grid-cols-2 gap-3 text-left sm:grid-cols-4 lg:grid-cols-2">
                    {facts.map(([k, v]) => (
                      <div key={k} className="rounded-2xl border border-line bg-white p-4 shadow-card">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{k}</dt>
                        <dd className="mt-1 text-sm font-bold text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-6 text-sm leading-6 text-muted">
                    {steps.length > 0
                      ? `Next you'll customize ${steps.length} ${steps.length === 1 ? "area" : "areas"} of the outfit — ${areas.join(", ")}. Only the options ${brand.name} offers for this fabric are shown, with sensible defaults pre-selected.`
                      : "This template has no style choices for this fabric, so you can go straight to the review."}
                  </p>
                </div>
              </section>
            </main>
            <ActionBar backHref="/order/template" backLabel="Choose another template">
              <Link
                href={steps.length > 0 ? "/order/customize" : "/order/review"}
                className={`${buttonClasses("primary")} w-full`}
              >
                {steps.length > 0 ? "Customize This Template" : "Continue to Review"}
                <ArrowIcon />
              </Link>
            </ActionBar>
          </div>
        );
      }}
    </OrderGate>
  );
}
