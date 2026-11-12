"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import type { AssignedCustomerRow } from "@multife/backend/modules/agents/types";
import { createProvisionalCustomerAction } from "@/app/(agent)/agent-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField, inputClasses } from "@/components/ui/text-field";
import { formatOrderDate } from "@/lib/order-status";
import { startOrderFor } from "@/lib/order-draft";
import { formatPhone, toInternationalPhone } from "@/lib/phone";

// The action passes Supabase's own wording through; these are common enough
// to deserve plain messages.
function friendlyError(error: string): string {
  if (/already (been )?registered|already exists/i.test(error)) {
    return /phone/i.test(error)
      ? "A customer with this phone number already exists."
      : "An account with this email already exists. The customer can sign in with it directly.";
  }
  if (/rate limit|too many/i.test(error)) return "Too many invite emails were sent just now. Please try again in a while.";
  return error;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ email?: string; phone?: string; form?: string }>({});
  const [added, setAdded] = useState<{ name: string; email: string } | null>(null);
  const [saving, startSaving] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setAdded(null);
    const cleanEmail = email.trim().toLowerCase();
    const found: typeof errors = {};
    if (!EMAIL_PATTERN.test(cleanEmail)) found.email = "Enter the customer's email address.";
    const international = phone.trim() ? toInternationalPhone(phone) : null;
    if (phone.trim() && !international) found.phone = "Enter a valid mobile number, e.g. 0300 1234567.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const name = fullName.trim();
    startSaving(async () => {
      const result = await createProvisionalCustomerAction({
        email: cleanEmail,
        phone: international ?? undefined,
        fullName: name || undefined,
      });
      if (!result.ok) {
        setErrors({ form: friendlyError(result.error) });
        return;
      }
      setAdded({ name: name || "The customer", email: cleanEmail });
      setFullName("");
      setEmail("");
      setPhone("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6 lg:sticky lg:top-32">
      <h2 className="font-display text-2xl text-ink">Add a customer</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        We&apos;ll email them an invite to set a password, so they can sign in and follow every order you place for
        them.
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
          id="customer-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="off"
          required
          maxLength={254}
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <TextField
          id="customer-phone"
          label="Mobile number"
          optional
          type="tel"
          inputMode="tel"
          autoComplete="off"
          maxLength={20}
          placeholder="0300 1234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
        />

        {errors.form && <Alert tone="danger">{errors.form}</Alert>}
        {added && (
          <Alert tone="success">
            {added.name} has been added. We&apos;ve emailed an invite to {added.email} to set their password.
          </Alert>
        )}

        <Button type="submit" pending={saving} pendingLabel="Adding…" className="w-full">
          Add customer &amp; send invite
        </Button>
      </form>
    </section>
  );
}

function CustomerList({ customers }: { customers: AssignedCustomerRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  // FR-AGT-03: the store flow runs as usual, saving the order for this customer.
  function startOrder(customerId: string, name: string) {
    startOrderFor({ customerId, name });
    router.push("/brands");
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    if (!q) return customers;
    return customers.filter((c) => {
      const name = (c.customer?.full_name ?? "").toLowerCase();
      const email = (c.customer?.email ?? "").toLowerCase();
      const phone = (c.customer?.phone ?? "").replace(/\D/g, "");
      return name.includes(q) || email.includes(q) || (qDigits.length >= 3 && phone.includes(qDigits.replace(/^0/, "")));
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
            {unclaimed > 0 && ` · ${unclaimed} haven't accepted their invite yet`}
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
              placeholder="Search name, email or number"
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
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-cyan-bright/10 font-display text-lg text-ocean"
                >
                  {name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{name}</p>
                  <p className="truncate text-sm text-muted">
                    {[c.customer?.email, formatPhone(c.customer?.phone)].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                </div>
                <div className="flex flex-none flex-col items-end gap-1 text-right">
                  {c.customer?.is_provisional ? (
                    <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-bold text-warning">Invite pending</span>
                  ) : (
                    <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-bold text-success">Active</span>
                  )}
                  <span className="text-xs text-hint">Added {formatOrderDate(c.acquired_at)}</span>
                </div>
                <div className="flex w-full gap-2 pl-14 sm:w-auto sm:pl-0">
                  <button
                    type="button"
                    onClick={() => startOrder(c.customer_id, name)}
                    className="h-9 rounded-full border border-white/30 bg-mf-blue px-4 text-xs font-bold text-white shadow-blue transition-transform hover:-translate-y-px"
                  >
                    Start order
                  </button>
                  <Link
                    href={`/agent/visits?customer=${c.customer_id}`}
                    className="inline-flex h-9 items-center rounded-full border border-line bg-white px-4 text-xs font-bold text-ink hover:border-cyan-bright/60 hover:text-ocean"
                  >
                    Book visit
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
