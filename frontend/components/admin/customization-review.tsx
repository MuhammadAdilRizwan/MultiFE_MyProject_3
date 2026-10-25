"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setFabricSupportedOptionsAction } from "@/app/(admin)/catalog-actions";
import { ActionBar } from "@/components/order/action-bar";
import { SelectedBadge, optionCardClasses } from "@/components/order/option-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { inputClasses } from "@/components/ui/text-field";
import type { Group, Step } from "@/lib/customization";

type Supported = Record<string, string[]>;

const pillClasses = "h-10 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-cyan-bright/60";

// Self-contained on purpose: if the client decides stores confirm their own
// customizations, this moves to the supplier panel unchanged (only the save
// action's permission check differs).
export function CustomizationReview({
  fabric,
  initial,
  unknownCount,
  steps,
  others,
}: {
  fabric: { id: string; isAvailable: boolean };
  initial: Supported;
  unknownCount: number;
  steps: Step[];
  others: { id: string; name: string; supportedOptions: Supported }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Supported>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const allGroups = steps.flatMap((s) => s.groups);
  const total = Object.values(selected).reduce((n, v) => n + v.length, 0);
  const isOn = (g: string, v: string) => selected[g]?.includes(v) ?? false;

  function update(next: Supported) {
    setSaved(false);
    setSelected(Object.fromEntries(Object.entries(next).filter(([, v]) => v.length > 0)));
  }
  const toggle = (g: string, v: string) =>
    update({ ...selected, [g]: isOn(g, v) ? selected[g].filter((x) => x !== v) : [...(selected[g] ?? []), v] });
  const setGroups = (groups: Group[], on: boolean) =>
    update({ ...selected, ...Object.fromEntries(groups.map((g) => [g.id, on ? g.options.map((o) => o.id) : []])) });

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setFabricSupportedOptionsAction({ fabricId: fabric.id, supportedOptions: selected });
      if (!result.ok) {
        setError(
          result.error.includes("FR-TPL-10")
            ? "This fabric is available to customers, so keep at least one option — or make it unavailable first."
            : result.error,
        );
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  if (allGroups.length === 0) {
    return <Alert tone="warning">The customization list is empty, so there is nothing to confirm yet.</Alert>;
  }

  return (
    <>
      <div className={`${cardClasses} flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5`}>
        <p className="text-sm font-semibold text-ink">
          {total} {total === 1 ? "option" : "options"} ticked
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {others.length > 0 && (
            <>
              <label htmlFor="copy-from" className="sr-only">
                Copy options from another fabric
              </label>
              <select
                id="copy-from"
                value=""
                onChange={(e) => {
                  const source = others.find((o) => o.id === e.target.value);
                  if (source) update(source.supportedOptions);
                }}
                className={`${inputClasses} h-10 w-auto text-sm`}
              >
                <option value="">Copy from another fabric…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <button type="button" onClick={() => setGroups(allGroups, true)} className={pillClasses}>
            Tick everything
          </button>
          <button type="button" onClick={() => update({})} className={pillClasses}>
            Clear all
          </button>
        </div>
      </div>

      {unknownCount > 0 && (
        <div className="mt-4">
          <Alert tone="warning">
            {unknownCount} saved {unknownCount === 1 ? "option isn't" : "options aren't"} in the customization list any
            more and will be removed when you save.
          </Alert>
        </div>
      )}

      <div className="mt-8 space-y-10 pb-6">
        {steps.map((step) => (
          <section key={step.slug} aria-labelledby={`step-${step.slug}`} className={`${cardClasses} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id={`step-${step.slug}`} className="font-display text-2xl text-ink">
                {step.title}
              </h2>
              <div className="flex gap-3 text-sm font-semibold">
                <button type="button" onClick={() => setGroups(step.groups, true)} className="text-ocean hover:underline">
                  Select all
                </button>
                <button type="button" onClick={() => setGroups(step.groups, false)} className="text-muted hover:underline">
                  Clear
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-8">
              {step.groups.map((group) => {
                const textOnly = group.options.every((o) => !o.image);
                return (
                  <fieldset key={group.id}>
                    <legend className="text-base font-bold text-ink">{group.title}</legend>
                    <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                      {group.options.map((option) => {
                        const on = isOn(group.id, option.id);
                        return (
                          <label key={option.id} className={`${optionCardClasses(on)} cursor-pointer has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-cyan-bright/30`}>
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(group.id, option.id)}
                              className="sr-only"
                            />
                            {on && <SelectedBadge />}
                            {!textOnly && (
                              <span className="relative flex aspect-square w-full items-center justify-center bg-cream">
                                {option.image ? (
                                  <Image src={option.image} alt="" fill sizes="140px" className="object-cover" />
                                ) : (
                                  <span aria-hidden="true" className="font-display text-2xl text-hint">
                                    {option.label.charAt(0)}
                                  </span>
                                )}
                              </span>
                            )}
                            <span className="flex min-h-[2.75rem] items-center justify-center px-2 py-2 text-center text-xs font-bold leading-tight text-ink">
                              {option.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <ActionBar>
        {error && (
          <div className="mb-2 w-full">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        {saved && (
          <div className="mb-2 w-full">
            <Alert tone="success">Customizations confirmed.</Alert>
          </div>
        )}
        <Button type="button" onClick={save} pending={pending} pendingLabel="Saving…" className="w-full">
          Save &amp; confirm
        </Button>
        {fabric.isAvailable && total === 0 && (
          <p className="text-center text-xs text-muted">This fabric is live, so it needs at least one option.</p>
        )}
      </ActionBar>
    </>
  );
}
