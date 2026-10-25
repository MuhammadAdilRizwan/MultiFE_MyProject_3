"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActionBar, ArrowIcon } from "@/components/order/action-bar";
import { OptionGroup } from "@/components/order/option-group";
import { OrderGate, type OrderContext } from "@/components/order/order-gate";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { PageTitle } from "@/components/order/page-title";
import { StepProgress } from "@/components/order/step-progress";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { fabricName } from "@/lib/catalog";
import { selectedOption, unsupportedChoices, type Step } from "@/lib/customization";
import { setSelections } from "@/lib/order-draft";

export function CustomizeStep({ slug, returnToReview }: { slug: string; returnToReview: boolean }) {
  return (
    <OrderGate needTemplate>
      {(ctx) => {
        const step = ctx.steps.find((s) => s.slug === slug);
        return step ? (
          <StepForm key={slug} step={step} ctx={ctx} returnToReview={returnToReview} />
        ) : (
          <SkipStep to={ctx.steps[0] ? `/order/customize/${ctx.steps[0].slug}` : "/order/review"} />
        );
      }}
    </OrderGate>
  );
}

// This fabric/template offers nothing in this step: move on instead of
// showing an empty page.
function SkipStep({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => router.replace(to), [router, to]);
  return (
    <div className="flex min-h-full flex-1 items-center justify-center" role="status" aria-label="Loading">
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-cyan-bright" />
    </div>
  );
}

function StepForm({ step, ctx, returnToReview }: { step: Step; ctx: OrderContext; returnToReview: boolean }) {
  const router = useRouter();
  const { steps, draft } = ctx;
  const index = steps.findIndex((s) => s.slug === step.slug);
  const [choices, setChoices] = useState(() =>
    Object.fromEntries(step.groups.map((g) => [g.id, selectedOption(g, draft.selections).id])),
  );
  const noLongerOffered = unsupportedChoices([step], draft.selections, draft.labels).filter((c) => c.stepSlug);

  const prevHref = returnToReview
    ? "/order/review"
    : index === 0
      ? "/order/preview"
      : `/order/customize/${steps[index - 1].slug}`;
  const nextHref =
    returnToReview || index === steps.length - 1 ? "/order/review" : `/order/customize/${steps[index + 1].slug}`;

  function save() {
    const labels = Object.fromEntries(
      step.groups.map((g) => [g.id, `${g.title}: ${g.options.find((o) => o.id === choices[g.id])?.label ?? ""}`]),
    );
    setSelections(choices, labels);
    router.push(nextHref);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <OrderTopBar backHref={prevHref} storeName={ctx.brand.name} />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
          <StepProgress current={index + 1} total={steps.length} label={`${ctx.template?.name} · ${fabricName(ctx.fabric)}`} />
          <div className="mt-8">
            <PageTitle title={step.title} subtitle={step.subtitle} />
          </div>

          {noLongerOffered.length > 0 && (
            <div className="mx-auto mt-6 max-w-2xl">
              <Alert tone="warning">
                {ctx.brand.name} no longer offers {noLongerOffered.map((c) => c.label).join(", ")} for this fabric.
                Please choose again below.
              </Alert>
            </div>
          )}

          <div className="mt-10 space-y-10">
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
            <p className="mt-10 flex gap-3 rounded-2xl border border-cyan-bright/30 bg-cyan-bright/10 p-4 text-sm leading-6 text-ink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="mt-0.5 h-5 w-5 flex-none text-ocean" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
              {step.note}
            </p>
          )}
        </div>
      </main>
      <ActionBar backHref={prevHref} backLabel={returnToReview ? "Back to review" : "Back"}>
        <button type="button" onClick={save} className={`${buttonClasses("primary")} w-full`}>
          {returnToReview ? "Save & return to review" : step.cta}
          <ArrowIcon />
        </button>
      </ActionBar>
    </div>
  );
}
