import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTemplateAction } from "@/app/(storefront)/catalog-actions";
import { Alert } from "@/components/ui/alert";
import { HeadingRule } from "@/components/ui/heading";
import { listOptionVocabulary } from "@/lib/admin-catalog";
import { TemplateDetails, TemplateOptions } from "./template-editor";

export const metadata: Metadata = { title: "Edit template" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function TemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [result, vocabulary] = await Promise.all([getTemplateAction({ templateId: id }), listOptionVocabulary().catch(() => null)]);
  if (!result.ok) notFound();
  const { options, ...template } = result.data;

  return (
    <div>
      <Link href="/admin/templates" className="text-sm font-semibold text-ocean hover:underline">
        ← All templates
      </Link>
      <div className="mt-3 max-w-2xl">
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{template.name}</h1>
        <HeadingRule align="left" className="mt-4" />
        <p className="mt-4 text-base leading-7 text-muted">
          {template.is_published ? "Published — customers can choose this template." : "Not published yet."}
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
        <TemplateDetails template={template} />
        {vocabulary ? (
          <TemplateOptions
            templateId={template.id}
            vocabulary={vocabulary}
            offered={options.map((o) => ({ groupId: o.group_id, valueId: o.value_id }))}
          />
        ) : (
          <Alert tone="danger">We couldn&apos;t load the customization list. Please refresh.</Alert>
        )}
      </div>
    </div>
  );
}
