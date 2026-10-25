"use client";

import Image from "next/image";
import Link from "next/link";
import { ActionBar, ArrowIcon } from "@/components/order/action-bar";
import { OrderGate } from "@/components/order/order-gate";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { buttonClasses } from "@/components/ui/button";
import { HeadingRule } from "@/components/ui/heading";
import { STEPS } from "@/lib/customization";

export function TemplatePreview() {
  return (
    <OrderGate needTemplate>
      {({ brand, fabric, template }) => {
        const t = template!;
        const facts: [string, string][] = [
          ["Fabric", fabric.name],
          ["Category", fabric.category],
          ["Style family", t.category],
          ["Colour", fabric.color],
        ];
        return (
          <div className="flex min-h-full flex-1 flex-col">
            <OrderTopBar backHref="/order/template" storeName={brand.name} />
            <main className="flex-1">
              <section className="mx-auto grid max-w-5xl items-center gap-8 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:px-8">
                <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-3xl border border-line bg-cream shadow-card lg:max-w-none">
                  <Image src={t.image} alt={t.name} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
                </div>
                <div className="text-center lg:text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean">Your template</p>
                  <h1 className="mt-2 font-display text-4xl leading-tight text-ink sm:text-5xl">{t.name}</h1>
                  <HeadingRule align="responsive" className="mt-3" />
                  <dl className="mt-8 grid grid-cols-2 gap-3 text-left sm:grid-cols-4 lg:grid-cols-2">
                    {facts.map(([k, v]) => (
                      <div key={k} className="rounded-2xl border border-line bg-white p-4 shadow-card">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{k}</dt>
                        <dd className="mt-1 text-sm font-bold text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-6 text-sm leading-6 text-muted">
                    Next you&apos;ll customize {STEPS.length} areas of the outfit — neckline, sleeves, length,
                    bottom wear, dupatta and more. Sensible defaults are pre-selected, so you can change only
                    what you want.
                  </p>
                </div>
              </section>
            </main>
            <ActionBar backHref="/order/template" backLabel="Choose another template">
              <Link href={`/order/customize/${STEPS[0].slug}`} className={`${buttonClasses("primary")} w-full`}>
                Customize This Template
                <ArrowIcon />
              </Link>
            </ActionBar>
          </div>
        );
      }}
    </OrderGate>
  );
}
