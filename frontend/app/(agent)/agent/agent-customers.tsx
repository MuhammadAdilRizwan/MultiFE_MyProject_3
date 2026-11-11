"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import type { AssignedCustomerRow } from "@multife/backend/modules/agents/types";
import { createProvisionalCustomerAction } from "@/app/(agent)/agent-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField, inputClasses } from "@/components/ui/text-field";
import { formatOrderDate } from "@/lib/order-status";
import { formatPhone, toInternationalPhone } from "@/lib/phone";

// The action passes Supabase's own wording through; this one is common
// enough (the same person added twice) to deserve a plain message.
function friendlyError(error: string): string {
  return /already (been )?registered|already exists/i.test(error)
    ? "A customer with this phone number already exists."
    : error;
}

export function AgentCustomers({ customers }: { customers: AssignedCustomerRow[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start">
      <AddCustomerForm />
      <CustomerList customers={customers} />
    </div>
  );
}

function AddCustomerForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ phone?: string; form?: string }>({});
  const [added, setAdded] = useState<{ name: string; phone: string } | null>(null);
  const [saving, startSaving] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setAdded(null);
    const international = toInternationalPhone(phone);
    if (!international) {
      setErrors({ phone: "Enter a valid mobile number, e.g. 0300 1234567." });
      return;
    }
    setErrors({});
    const name = fullName.trim();
    startSaving(async () => {
      const result = await createProvisionalCustomerAction({ phone: international, fullName: name || undefined });
      if (!result.ok) {
        setErrors({ form: friendlyError(result.error) });
        return;
      }
      setAdded({ name: name || "Customer", phone: formatPhone(international) });
      setFullName("");
      setPhone("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6 lg:sticky lg:top-24">
      <h2 className="font-display text-2xl text-ink">Add a customer</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        For someone you&apos;re helping in person. They can claim the account later with their phone number.
      </p>

      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        <TextField
          id="customer-name"
          label="Full name"
          optional
          autoComplete="off"
          maxLength={80}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <TextField
          id="customer-phone"
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          required
          maxLength={20}
          placeholder="0300 1234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          hint="Pakistani numbers can be typed as 03XX XXXXXXX."
        />

        {errors.form && <Alert tone="danger">{errors.form}</Alert>}
        {added && (
          <Alert tone="success">
            {added.name} ({added.phone}) has been added to your customers.
          </Alert>
        )}

        <Button type="submit" pending={saving} pendingLabel="Adding…" className="w-full">
          Add customer
        </Button>
      </form>
    </section>
  );
}

function CustomerList({ customers }: { customers: AssignedCustomerRow[] }) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    if (!q) return customers;
    return customers.filter((c) => {
      const name = (c.customer?.full_name ?? "").toLowerCase();
      const phone = (c.customer?.phone ?? "").replace(/\D/g, "");
      return name.includes(q) || (qDigits.length >= 3 && phone.includes(qDigits.replace(/^0/, "")));
    });
  }, [customers, query]);

  const unclaimed = customers.filter((c) => c.customer?.is_provisional).length;

  return (
    <section aria-labelledby="customers-heading" className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="customers-heading" className="font-display text-2xl text-ink">
            Your customers
          </h2>
          <p className="mt-1 text-sm text-muted">
            {customers.length} {customers.length === 1 ? "customer" : "customers"}
            {unclaimed > 0 && ` · ${unclaimed} not yet claimed`}
          </p>
        </div>
        {customers.length > 0 && (
          <div className="w-full sm:w-64">
            <label htmlFor="customer-search" className="sr-only">
              Search customers
            </label>
            <input
              id="customer-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or number"
              className={`${inputClasses} h-11 text-sm`}
            />
          </div>
        )}
      </div>

      {customers.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
          <p className="text-base font-semibold text-ink">No customers yet</p>
          <p className="mt-1 text-sm text-muted">Add the first customer you&apos;re helping using the form.</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">No customers match &ldquo;{query}&rdquo;.</p>
      ) : (
        <ul className="mt-5 divide-y divide-line">
          {visible.map((c) => {
            const name = c.customer?.full_name?.trim() || "Unnamed customer";
            return (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-cyan-bright/10 font-display text-lg text-ocean"
                >
                  {name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{name}</p>
                  <p className="truncate text-sm text-muted">{formatPhone(c.customer?.phone) || "No phone"}</p>
                </div>
                <div className="flex flex-none flex-col items-end gap-1 text-right">
                  {c.customer?.is_provisional ? (
                    <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-bold text-warning">Not yet claimed</span>
                  ) : (
                    <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-bold text-success">Active</span>
                  )}
                  <span className="text-xs text-hint">Added {formatOrderDate(c.acquired_at)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
