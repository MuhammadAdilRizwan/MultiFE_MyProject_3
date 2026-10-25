"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { TemplateRow } from "@multife/backend/modules/catalog/types";
import { createTemplateAction, setTemplatePublishedAction } from "@/app/(admin)/catalog-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { formatPKR } from "@/lib/catalog";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function TemplateList({ templates }: { templates: TemplateRow[] }) {
  if (templates.length === 0) {
    return (
      <div className={`${cardClasses} p-8 text-center`}>
        <p className="text-base font-semibold text-ink">No templates yet.</p>
        <p className="mt-2 text-sm text-muted">Add your first outfit template.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {templates.map((t) => (
        <TemplateRowItem key={t.id} template={t} />
      ))}
    </ul>
  );
}

function TemplateRowItem({ template }: { template: TemplateRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setTemplatePublishedAction({ templateId: template.id, isPublished: !template.is_published });
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <li className={`${cardClasses} p-4 sm:p-5`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link href={`/admin/templates/${template.id}`} className="text-lg font-extrabold tracking-tight text-ink hover:text-ocean">
            {template.name}
          </Link>
          <p className="mt-0.5 text-sm text-muted">
            Stitching {formatPKR(template.base_stitch_price)} · {template.lead_days} days
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={template.is_published} disabled={pending} onChange={toggle} className="h-5 w-5 accent-ocean" />
            Published
          </label>
          <Link
            href={`/admin/templates/${template.id}`}
            className="rounded-full border border-white/30 bg-mf-blue px-4 py-2 text-sm font-bold text-white shadow-blue"
          >
            Edit
          </Link>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </li>
  );
}

export function AddTemplateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter the template name.");
    if (!SLUG_PATTERN.test(slug)) return setError("The template key can use lowercase letters, numbers and dashes.");

    startTransition(async () => {
      const result = await createTemplateAction({ name: name.trim(), slug });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/templates/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className={`${cardClasses} space-y-4 p-5 sm:p-6`}>
      <div>
        <h2 className="text-base font-bold text-ink">Add a template</h2>
        <p className="mt-1 text-sm text-muted">It starts unpublished; you&apos;ll set its price and options next.</p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <TextField
        id="template-name"
        label="Template name"
        autoComplete="off"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (!slugEdited) setSlug(toSlug(e.target.value));
        }}
      />
      <TextField
        id="template-slug"
        label="Template key"
        autoComplete="off"
        hint="Lowercase letters, numbers and dashes."
        value={slug}
        onChange={(e) => {
          setSlug(e.target.value);
          setSlugEdited(true);
        }}
      />
      <Button type="submit" className="w-full" pending={pending} pendingLabel="Adding…">
        Add template
      </Button>
    </form>
  );
}
