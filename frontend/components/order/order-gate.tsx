"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { getOrderContextAction, type OrderContextData } from "@/app/(storefront)/catalog-actions";
import { buttonClasses } from "@/components/ui/button";
import { buildSteps, type Step } from "@/lib/customization";
import { useDraft, type Draft } from "@/lib/order-draft";
import { OrderTopBar } from "./order-top-bar";

export type OrderContext = OrderContextData & { draft: Draft; steps: Step[] };

type Loaded = { key: string; result: Awaited<ReturnType<typeof getOrderContextAction>> };

// Renders children only once the saved order has been read and checked
// against the live catalogue; otherwise a loading state or a way back to the start.
// Read fresh on every order page (no cache): availability and who is signed in
// can change between pages.
export function OrderGate({
  needTemplate = false,
  children,
}: {
  needTemplate?: boolean;
  children: (ctx: OrderContext) => ReactNode;
}) {
  const draft = useDraft();
  const key = draft?.brandSlug && draft.fabricId ? `${draft.brandSlug}|${draft.fabricId}|${draft.templateId ?? ""}` : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const brandSlug = draft?.brandSlug;
  const fabricId = draft?.fabricId;
  const templateId = draft?.templateId ?? null;

  useEffect(() => {
    if (!key || !brandSlug || !fabricId) return;
    let cancelled = false;
    getOrderContextAction({ brandSlug, fabricId, templateId })
      .then((result) => {
        if (!cancelled) setLoaded({ key, result });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, result: { ok: false, error: "Could not load your order." } });
      });
    return () => {
      cancelled = true;
    };
  }, [key, brandSlug, fabricId, templateId]);

  if (draft && !key) return <StartAgain />;
  const result = loaded?.key === key ? loaded.result : null;
  if (!draft || !result) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center" role="status" aria-label="Loading your order">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-cyan-bright" />
      </div>
    );
  }

  if (!result.ok) {
    return result.error === "Template not found." ? <ChooseTemplate /> : <StartAgain />;
  }
  if (needTemplate && !result.data.template) return <ChooseTemplate />;

  const data = result.data;
  const steps = buildSteps(data.options, data.template?.recommended_options ?? {});
  return <>{children({ ...data, draft, steps })}</>;
}

function StartAgain() {
  return (
    <Missing
      title="Start by choosing a fabric"
      text="Pick a brand and a fabric first — your style choices are built on top of it."
      href="/#brands"
      action="Browse brands"
    />
  );
}

function ChooseTemplate() {
  return (
    <Missing
      title="Choose a template first"
      text="Select the outfit you'd like to customize, then continue from there."
      href="/order/template"
      action="Choose a template"
    />
  );
}

function Missing({ title, text, href, action }: { title: string; text: string; href: string; action: string }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <OrderTopBar backHref="/" backLabel="Home" />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-card">
          <h1 className="font-display text-3xl text-ink">{title}</h1>
          <p className="mt-3 text-base leading-7 text-muted">{text}</p>
          <Link href={href} className={`${buttonClasses("primary")} mt-6 w-full`}>
            {action}
          </Link>
        </div>
      </main>
    </div>
  );
}
