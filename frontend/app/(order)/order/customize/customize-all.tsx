"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ActionBar, ArrowIcon } from "@/components/order/action-bar";
import { OptionGroup } from "@/components/order/option-group";
import { OrderGate, type OrderContext } from "@/components/order/order-gate";
import { OrderTopBar } from "@/components/order/order-top-bar";
import { PageTitle } from "@/components/order/page-title";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fabricName } from "@/lib/catalog";
import { selectedOption, unsupportedChoices } from "@/lib/customization";
import { setSelections } from "@/lib/order-draft";
import { syncRemoteOptions } from "@/lib/order-sync";

export function CustomizeAll() {
  return <OrderGate needTemplate>{(ctx) => <CustomizeForm ctx={ctx} />}</OrderGate>;
}

// Every customization the fabric and template offer, on one page, in a single
// "Customizations Offered" section (groups keep the prototype's order).
function CustomizeForm({ ctx }: { ctx: OrderContext }) {
  const router = useRouter();
  const { steps, draft, brand } = ctx;
  const groups = steps.flatMap((s) => s.groups);
  const notes = steps.flatMap((s) => (s.note ? [s.note] : []));
  const [choices, setChoices] = useState(() =>
    Object.fromEntries(groups.map((g) => [g.id, selectedOption(g, draft.selections).id])),
  );
  const [saving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const noLongerOffered = unsupportedChoices(steps, draft.selections, draft.labels).filter((c) => c.stepSlug);

  // "Edit" on the review page links to #option-<group>; the groups only exist
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
    setSaveError(null);
    if (!ctx.isCustomer) {
      router.push("/order/review");
      return;
    }
    startSaving(async () => {
      const result = await syncRemoteOptions(choices);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      router.push("/order/review");
    });
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <OrderTopBar backHref="/order/preview" storeName={brand.name} />
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
            <section
              aria-labelledby="offered-title"
              className="mt-10 rounded-3xl border border-line bg-white/80 p-5 shadow-card backdrop-blur-xl sm:p-7"
            >
              <h2 id="offered-title" className="font-display text-2xl leading-tight text-ink sm:text-3xl">
                Customizations Offered
              </h2>
              <p className="mt-1 text-sm text-muted">
                Everything {brand.name} offers for this fabric and template, all in one place.
              </p>

              <div className="mt-6 space-y-8">
                {groups.map((g, i) => (
                  <div key={g.id} id={`option-${g.id}`} className="scroll-mt-24">
                    <OptionGroup
                      group={g}
                      index={i + 1}
                      value={choices[g.id]}
                      onChange={(id) => setChoices((c) => ({ ...c, [g.id]: id }))}
                    />
                  </div>
                ))}
              </div>

              {notes.map((note) => (
                <p key={note} className="mt-8 flex gap-3 rounded-2xl border border-cyan-bright/30 bg-cyan-bright/10 p-4 text-sm leading-6 text-ink">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="mt-0.5 h-5 w-5 flex-none text-ocean" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 11v5M12 8h.01" />
                  </svg>
                  {note}
                </p>
              ))}
            </section>
          )}
        </div>
      </main>
      <ActionBar backHref="/order/preview" backLabel="Back to template">
        {saveError && (
          <div className="mb-2 w-full">
            <Alert tone="danger">{saveError}</Alert>
          </div>
        )}
        <Button type="button" onClick={save} pending={saving} pendingLabel="Saving…" className="w-full">
          Save &amp; Review
          <ArrowIcon />
        </Button>
      </ActionBar>
    </div>
  );
}
