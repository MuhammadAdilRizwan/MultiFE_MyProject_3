"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActionBar, ArrowIcon } from "@/components/order/action-bar";
import { OptionGroup } from "@/components/order/option-group";
import { OrderGate, type OrderContext } from "@/components/order/order-gate";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { PageTitle } from "@/components/order/page-title";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { fabricName } from "@/lib/catalog";
import { selectedOption, unsupportedChoices } from "@/lib/customization";
import { setSelections } from "@/lib/order-draft";

export function CustomizeAll() {
  return <OrderGate needTemplate>{(ctx) => <CustomizeForm ctx={ctx} />}</OrderGate>;
}

// Every customization the fabric and template offer, on one page: one
// section per area (neck, sleeves, …) with a jump bar to move between them.
function CustomizeForm({ ctx }: { ctx: OrderContext }) {
  const router = useRouter();
  const { steps, draft, brand } = ctx;
  const groups = steps.flatMap((s) => s.groups);
  const [choices, setChoices] = useState(() =>
    Object.fromEntries(groups.map((g) => [g.id, selectedOption(g, draft.selections).id])),
  );
  const noLongerOffered = unsupportedChoices(steps, draft.selections, draft.labels).filter((c) => c.stepSlug);

  // "Edit" on the review page links to #step-<slug>; the sections only exist
  // once the order has loaded, so scroll to it here rather than rely on the
  // browser's jump at navigation time.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  function save() {
    const labels = Object.fromEntries(
      groups.map((g) => [g.id, `${g.title}: ${g.options.find((o) => o.id === choices[g.id])?.label ?? ""}`]),
    );
    setSelections(choices, labels);
    router.push("/order/review");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <OrderTopBar backHref="/order/preview" storeName={brand.name} />
      {steps.length > 1 && (
        <nav
          aria-label="Customization sections"
          className="sticky top-16 z-30 border-b border-line bg-white/85 backdrop-blur-xl"
        >
          <ul className="mx-auto flex max-w-4xl gap-2 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-8">
            {steps.map((s) => (
              <li key={s.slug} className="flex-none">
                <a
                  href={`#step-${s.slug}`}
                  className="inline-flex h-9 items-center rounded-full border border-line bg-white px-3.5 text-xs font-semibold text-ink transition-colors hover:border-cyan-bright/60 hover:text-ocean"
                >
                  {s.reviewLabel}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <PageTitle
            title="Customize Your Outfit"
            subtitle={`${ctx.template?.name} in ${fabricName(ctx.fabric)}. Sensible defaults are pre-selected — change only what you want.`}
          />

          {noLongerOffered.length > 0 && (
            <div className="mx-auto mt-6 max-w-2xl">
              <Alert tone="warning">
                {brand.name} no longer offers {noLongerOffered.map((c) => c.label).join(", ")} for this fabric.
                Please choose again below.
              </Alert>
            </div>
          )}

          {steps.length === 0 ? (
            <p className="mx-auto mt-10 max-w-md text-center text-base text-muted">
              This template has no style choices for this fabric. Continue to the review.
            </p>
          ) : (
            <div className="mt-10 space-y-8">
              {steps.map((step) => (
                <section
                  key={step.slug}
                  id={`step-${step.slug}`}
                  aria-labelledby={`step-${step.slug}-title`}
                  className="scroll-mt-32 rounded-3xl border border-line bg-white/80 p-5 shadow-card backdrop-blur-xl sm:p-7"
                >
                  <h2 id={`step-${step.slug}-title`} className="font-display text-2xl leading-tight text-ink sm:text-3xl">
                    {step.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted">{step.subtitle}</p>

                  <div className="mt-6 space-y-8">
                    {step.groups.map((g, i) => (
                      <OptionGroup
                        key={g.id}
                        group={g}
                        index={i + 1}
                        value={choices[g.id]}
                        onChange={(id) => setChoices((c) => ({ ...c, [g.id]: id }))}
                      />
                    ))}
                  </div>

                  {step.note && (
                    <p className="mt-8 flex gap-3 rounded-2xl border border-cyan-bright/30 bg-cyan-bright/10 p-4 text-sm leading-6 text-ink">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="mt-0.5 h-5 w-5 flex-none text-ocean" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 11v5M12 8h.01" />
                      </svg>
                      {step.note}
                    </p>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
      <ActionBar backHref="/order/preview" backLabel="Back to template">
        <button type="button" onClick={save} className={`${buttonClasses("primary")} w-full`}>
          Save & Review
          <ArrowIcon />
        </button>
      </ActionBar>
    </div>
  );
}
