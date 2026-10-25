"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { getBrand, getFabric, getTemplate, type Brand, type Fabric, type Template } from "@/lib/catalog";
import { useDraft, type Draft } from "@/lib/order-draft";
import { OrderTopBar } from "./order-top-bar";

export type OrderContext = { draft: Draft; brand: Brand; fabric: Fabric; template: Template | null };

// Renders children only once the saved order has been read and has what this
// page needs; otherwise a loading state or a way back to the start.
export function OrderGate({
  needTemplate = false,
  children,
}: {
  needTemplate?: boolean;
  children: (ctx: OrderContext) => ReactNode;
}) {
  const draft = useDraft();

  if (!draft) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center" role="status" aria-label="Loading your order">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-cyan-bright" />
      </div>
    );
  }

  const brand = draft.brandSlug ? getBrand(draft.brandSlug) : undefined;
  const fabric = draft.fabricId ? getFabric(draft.fabricId) : undefined;
  const template = draft.templateId ? getTemplate(draft.templateId) ?? null : null;

  if (!brand || !fabric) {
    return (
      <Missing
        title="Start by choosing a fabric"
        text="Pick a brand and a fabric first — your style choices are built on top of it."
        href="/#brands"
        action="Browse brands"
      />
    );
  }
  if (needTemplate && !template) {
    return (
      <Missing
        title="Choose a template first"
        text="Select the outfit you'd like to customize, then continue from there."
        href="/order/template"
        action="Choose a template"
      />
    );
  }
  return <>{children({ draft, brand, fabric, template })}</>;
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
