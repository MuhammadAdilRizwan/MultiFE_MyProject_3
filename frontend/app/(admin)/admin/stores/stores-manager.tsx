"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createSupplierAction, setSupplierStatusAction } from "@/app/(admin)/catalog-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { TextField, inputClasses } from "@/components/ui/text-field";
import type { AdminSupplier } from "@/lib/admin-catalog";

type Status = AdminSupplier["status"];

const STATUS_LABELS: Record<Status, string> = { pending: "Pending", active: "Live", suspended: "Suspended" };

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function StoreList({ suppliers }: { suppliers: AdminSupplier[] }) {
  if (suppliers.length === 0) {
    return (
      <div className={`${cardClasses} p-8 text-center`}>
        <p className="text-base font-semibold text-ink">No stores yet.</p>
        <p className="mt-2 text-sm text-muted">Add a brand once you&apos;ve agreed its onboarding.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {suppliers.map((s) => (
        <StoreRow key={s.id} supplier={s} />
      ))}
    </ul>
  );
}

function StoreRow({ supplier }: { supplier: AdminSupplier }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeStatus(status: Status) {
    setError(null);
    startTransition(async () => {
      const result = await setSupplierStatusAction({ supplierId: supplier.id, status });
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <li className={`${cardClasses} p-4 sm:p-5`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link href={`/admin/stores/${supplier.id}`} className="text-lg font-extrabold tracking-tight text-ink hover:text-ocean">
            {supplier.name}
          </Link>
          <p className="mt-0.5 text-sm text-muted">
            /s/{supplier.slug} · {supplier.fabricCount} {supplier.fabricCount === 1 ? "fabric" : "fabrics"}
            {supplier.unconfirmedCount > 0 && (
              <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">
                {supplier.unconfirmedCount} to confirm
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor={`status-${supplier.id}`} className="sr-only">
            Status of {supplier.name}
          </label>
          <select
            id={`status-${supplier.id}`}
            value={supplier.status}
            disabled={pending}
            onChange={(e) => changeStatus(e.target.value as Status)}
            className={`${inputClasses} h-11 w-36 text-sm font-semibold`}
          >
            {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <Link
            href={`/admin/stores/${supplier.id}`}
            className="rounded-full border border-white/30 bg-mf-blue px-4 py-2 text-sm font-bold text-white shadow-blue"
          >
            Open
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

export function AddStoreForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAdded(null);
    if (!name.trim()) return setError("Enter the brand name.");
    if (!SLUG_PATTERN.test(slug)) return setError("The store link can use lowercase letters, numbers and dashes.");

    startTransition(async () => {
      const result = await createSupplierAction({ name: name.trim(), slug });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAdded(result.data.name);
      setName("");
      setSlug("");
      setSlugEdited(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className={`${cardClasses} space-y-4 p-5 sm:p-6`}>
      <div>
        <h2 className="text-base font-bold text-ink">Add a store</h2>
        <p className="mt-1 text-sm text-muted">New stores start as Pending — set them Live when they&apos;re ready.</p>
      </div>
      {added && <Alert tone="success">{added} was added.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <TextField
        id="store-name"
        label="Brand name"
        autoComplete="off"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (!slugEdited) setSlug(toSlug(e.target.value));
        }}
      />
      <TextField
        id="store-slug"
        label="Store link"
        autoComplete="off"
        hint={slug ? `multife.com/s/${slug}` : "Lowercase letters, numbers and dashes."}
        value={slug}
        onChange={(e) => {
          setSlug(e.target.value);
          setSlugEdited(true);
        }}
      />
      <Button type="submit" className="w-full" pending={pending} pendingLabel="Adding…">
        Add store
      </Button>
    </form>
  );
}
