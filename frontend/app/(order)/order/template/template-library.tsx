"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionBar, ArrowIcon } from "@/components/order/action-bar";
import { SelectedBadge, optionCardClasses } from "@/components/order/option-card";
import { OrderGate } from "@/components/order/order-gate";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { PageTitle } from "@/components/order/page-title";
import { buttonClasses } from "@/components/ui/button";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/catalog";
import { updateDraft } from "@/lib/order-draft";

type Tab = "All" | (typeof TEMPLATE_CATEGORIES)[number];
const TABS: Tab[] = ["All", ...TEMPLATE_CATEGORIES];

export function TemplateLibrary() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("All");
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <OrderGate>
      {({ draft, brand }) => {
        const selectedId = picked ?? draft.templateId;
        const visible = TEMPLATES.filter((t) => tab === "All" || t.category === tab);
        return (
          <div className="flex min-h-full flex-1 flex-col">
            <OrderTopBar backHref={`/s/${brand.slug}/fabrics/${draft.fabricId}`} storeName={brand.name} />
            <main className="flex-1">
              <section className="mx-auto max-w-5xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
                <PageTitle title="Dress Template Library" subtitle="Choose a template to start customizing." />

                <div
                  role="tablist"
                  aria-label="Template category"
                  className="mx-auto mt-8 flex max-w-lg gap-1 rounded-2xl border border-line bg-white/90 p-1.5 shadow-card"
                >
                  {TABS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={tab === t}
                      onClick={() => setTab(t)}
                      className={`h-10 flex-1 rounded-xl text-sm font-semibold transition-colors ${
                        tab === t ? "bg-mf-blue text-white shadow-blue" : "text-ink hover:bg-cyan-bright/10"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
                  {visible.map((t) => {
                    const selected = t.id === selectedId;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setPicked(t.id)}
                          className={optionCardClasses(selected)}
                        >
                          {selected && <SelectedBadge />}
                          <span className="relative block aspect-square w-full bg-cream">
                            <Image
                              src={t.image}
                              alt={t.name}
                              fill
                              sizes="(min-width: 1024px) 240px, (min-width: 640px) 33vw, 50vw"
                              className="object-cover"
                            />
                          </span>
                          <span className="px-3 py-3 text-center">
                            <span className="block text-sm font-bold text-ink sm:text-base">{t.name}</span>
                            <span className="mt-0.5 block text-xs text-muted">{t.category}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </main>
            <ActionBar>
              <button
                type="button"
                disabled={!selectedId}
                onClick={() => {
                  if (!selectedId) return;
                  updateDraft({ templateId: selectedId });
                  router.push("/order/preview");
                }}
                className={`${buttonClasses("primary")} w-full`}
              >
                {selectedId ? "Continue" : "Select a Template"}
                <ArrowIcon />
              </button>
            </ActionBar>
          </div>
        );
      }}
    </OrderGate>
  );
}
