"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { TemplateRow } from "@multife/backend/modules/catalog/types";
import { createTemplateOptionAction, updateTemplateAction } from "@/app/(admin)/catalog-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import type { VocabularyGroup } from "@/lib/admin-catalog";

const isNumber = (s: string) => s.trim() !== "" && Number.isFinite(Number(s)) && Number(s) >= 0;

export function TemplateDetails({ template }: { template: TemplateRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formula = template.yardage_formula ?? { base_metres: 0, coefficients: {}, wastage_margin: 0 };
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [price, setPrice] = useState(String(template.base_stitch_price));
  const [leadDays, setLeadDays] = useState(String(template.lead_days));
  const [baseMetres, setBaseMetres] = useState(typeof formula.base_metres === "number" ? String(formula.base_metres) : "");
  const [wastage, setWastage] = useState(
    typeof formula.wastage_margin === "number" ? String(Math.round(formula.wastage_margin * 1000) / 10) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (!name.trim()) return setError("Enter the template name.");
    if (!isNumber(price)) return setError("Enter the stitching price.");
    if (!isNumber(leadDays) || !Number.isInteger(Number(leadDays))) return setError("Enter the lead time in whole days.");
    if (!isNumber(baseMetres)) return setError("Enter the base fabric needed, in metres.");
    if (!isNumber(wastage)) return setError("Enter the wastage margin as a percentage.");

    startTransition(async () => {
      const result = await updateTemplateAction({
        templateId: template.id,
        name: name.trim(),
        description: description.trim(),
        baseStitchPrice: Number(price),
        leadDays: Number(leadDays),
        // Per-measurement coefficients are kept as they are; only the base and margin are edited here.
        yardageFormula: {
          base_metres: Number(baseMetres),
          coefficients: formula.coefficients ?? {},
          wastage_margin: Number(wastage) / 100,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className={`${cardClasses} space-y-4 p-5 sm:p-6`}>
      <h2 className="text-base font-bold text-ink">Details</h2>
      {saved && <Alert tone="success">Saved.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <TextField id="tpl-name" label="Name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField
        id="tpl-description"
        label="Description"
        optional
        autoComplete="off"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-4">
        <TextField id="tpl-price" label="Stitching (PKR)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
        <TextField id="tpl-lead" label="Lead time (days)" inputMode="numeric" value={leadDays} onChange={(e) => setLeadDays(e.target.value)} />
        <TextField id="tpl-metres" label="Base fabric (m)" inputMode="decimal" value={baseMetres} onChange={(e) => setBaseMetres(e.target.value)} />
        <TextField id="tpl-wastage" label="Wastage (%)" inputMode="decimal" value={wastage} onChange={(e) => setWastage(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" pending={pending} pendingLabel="Saving…">
        Save details
      </Button>
    </form>
  );
}

export function TemplateOptions({
  templateId,
  vocabulary,
  offered,
}: {
  templateId: string;
  vocabulary: VocabularyGroup[];
  offered: { groupId: string; valueId: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const isOffered = (valueId: string) => offered.some((o) => o.valueId === valueId);

  function toggle(valueId: string) {
    setAdding((current) => {
      const next = new Set(current);
      if (next.has(valueId)) next.delete(valueId);
      else next.add(valueId);
      return next;
    });
  }

  function addSelected() {
    setError(null);
    startTransition(async () => {
      for (const group of vocabulary) {
        const groupHasDefault = offered.some((o) => o.groupId === group.id);
        const toAdd = group.values.filter((v) => adding.has(v.id));
        for (const [i, value] of toAdd.entries()) {
          const result = await createTemplateOptionAction({
            templateId,
            groupId: group.id,
            valueId: value.id,
            // The first value a group gets becomes its default choice.
            isDefault: !groupHasDefault && i === 0,
          });
          if (!result.ok) {
            setError(result.error);
            router.refresh();
            return;
          }
        }
      }
      setAdding(new Set());
      router.refresh();
    });
  }

  return (
    <section className={`${cardClasses} p-5 sm:p-6`} aria-labelledby="tpl-options">
      <h2 id="tpl-options" className="text-base font-bold text-ink">
        Options this template offers
      </h2>
      <p className="mt-1 text-sm text-muted">
        Customers see an option only if the template offers it and the fabric&apos;s store has confirmed it.
      </p>
      {error && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {vocabulary.length === 0 ? (
        <p className="mt-6 text-sm text-muted">The customization list is empty.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {vocabulary.map((group) => (
            <fieldset key={group.id}>
              <legend className="text-sm font-bold text-ink">{group.label}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.values.map((value) =>
                  isOffered(value.id) ? (
                    <span key={value.id} className="rounded-full bg-success-soft px-3 py-1.5 text-xs font-bold text-success">
                      ✓ {value.label}
                    </span>
                  ) : (
                    <label
                      key={value.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        adding.has(value.id) ? "border-cyan-bright bg-cyan-bright/10 text-ocean" : "border-line bg-white text-muted"
                      }`}
                    >
                      <input type="checkbox" checked={adding.has(value.id)} onChange={() => toggle(value.id)} className="h-3.5 w-3.5 accent-ocean" />
                      {value.label}
                    </label>
                  ),
                )}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      <Button
        type="button"
        onClick={addSelected}
        disabled={adding.size === 0}
        pending={pending}
        pendingLabel="Adding…"
        className="mt-6 w-full sm:w-auto"
      >
        Add selected options
      </Button>
    </section>
  );
}
