"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { TemplateRow } from "@multife/backend/modules/catalog/types";
import { listCompatibleTemplatesForFabricAction } from "@/app/(storefront)/catalog-actions";
import { ActionBar, ArrowIcon } from "@/components/order/action-bar";
import { SelectedBadge, optionCardClasses } from "@/components/order/option-card";
import { OrderGate, type OrderContext } from "@/components/order/order-gate";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { PageTitle } from "@/components/order/page-title";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { estimateOrderFrom, formatPKR, templateImage } from "@/lib/catalog";
import { updateDraft } from "@/lib/order-draft";

type Loaded = { fabricId: string; templates: TemplateRow[] | null };

export function TemplateLibrary() {
  return <OrderGate>{(ctx) => <Library ctx={ctx} />}</OrderGate>;
}

function Library({ ctx }: { ctx: OrderContext }) {
  const router = useRouter();
  const { draft, brand, fabric } = ctx;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  // FR-CUS-06: only templates this fabric's supported options can make.
  useEffect(() => {
    let cancelled = false;
    listCompatibleTemplatesForFabricAction({ fabricId: fabric.id })
      .then((result) => {
        if (!cancelled) {
          setLoaded({ fabricId: fabric.id, templates: result.ok ? result.data.filter((t) => t.is_published) : null });
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded({ fabricId: fabric.id, templates: null });
      });
    return () => {
      cancelled = true;
    };
  }, [fabric.id]);

  const templates = loaded?.fabricId === fabric.id ? loaded.templates : undefined;
  const selectedId = picked ?? (templates?.some((t) => t.id === draft.templateId) ? draft.templateId : null);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <OrderTopBar backHref={`/s/${brand.slug}/fabrics/${fabric.id}`} storeName={brand.name} />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <PageTitle title="Dress Template Library" subtitle="Templates that can be made in your chosen fabric." />

          {templates === undefined ? (
            <div className="mt-12 flex justify-center" role="status" aria-label="Loading templates">
              <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-cyan-bright" />
            </div>
          ) : templates === null ? (
            <div className="mx-auto mt-10 max-w-md">
              <Alert tone="danger">We couldn&apos;t load the templates. Please refresh to try again.</Alert>
            </div>
          ) : templates.length === 0 ? (
            <div className="mx-auto mt-10 max-w-md text-center">
              <p className="text-base font-semibold text-ink">No templates can be made in this fabric yet.</p>
              <p className="mt-2 text-sm text-muted">Try another fabric from {brand.name}.</p>
            </div>
          ) : (
            <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
              {templates.map((t) => {
                const selected = t.id === selectedId;
                const image = templateImage(t.slug);
                const estimate = estimateOrderFrom(t, fabric);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setPicked(t.id)}
                      className={`${optionCardClasses(selected)} h-full`}
                    >
                      {selected && <SelectedBadge />}
                      <span className="relative flex aspect-square w-full items-center justify-center bg-cream">
                        {image ? (
                          <Image src={image} alt={t.name} fill sizes="(min-width: 1024px) 240px, (min-width: 640px) 33vw, 50vw" className="object-cover" />
                        ) : (
                          <span aria-hidden="true" className="font-display text-5xl text-hint">
                            {t.name.charAt(0)}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-1 flex-col px-3 py-3 text-center">
                        <span className="block text-sm font-bold text-ink sm:text-base">{t.name}</span>
                        {t.description && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{t.description}</span>}
                        <span className="mt-1.5 block text-xs font-semibold text-ocean">
                          {estimate ? `From ${formatPKR(estimate.total)}` : `Stitching ${formatPKR(t.base_stitch_price)}`}
                          {` · ${t.lead_days} days`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
      <ActionBar>
        <button
          type="button"
          disabled={!selectedId}
          onClick={() => {
            if (!selectedId) return;
            // Choices belong to a template; a different one starts fresh.
            updateDraft(
              selectedId === draft.templateId ? { templateId: selectedId } : { templateId: selectedId, selections: {}, labels: {} },
            );
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
}
