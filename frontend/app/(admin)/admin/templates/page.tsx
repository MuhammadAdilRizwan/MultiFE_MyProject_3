import type { Metadata } from "next";
import { listTemplatesAction } from "@/app/(storefront)/catalog-actions";
import { Alert } from "@/components/ui/alert";
import { HeadingRule } from "@/components/ui/heading";
import { AddTemplateForm, TemplateList } from "./templates-manager";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  // Admin session: RLS returns unpublished templates too.
  const result = await listTemplatesAction();

  return (
    <div>
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">Templates</h1>
        <HeadingRule align="left" className="mt-4" />
        <p className="mt-4 text-base leading-7 text-muted">
          MultiFe&apos;s own outfit templates. Set up a template&apos;s options before publishing it — customers only
          see published templates that their chosen fabric can make.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        {result.ok ? (
          <TemplateList templates={result.data} />
        ) : (
          <Alert tone="danger">We couldn&apos;t load the templates. Please refresh.</Alert>
        )}
        <AddTemplateForm />
      </div>
    </div>
  );
}
