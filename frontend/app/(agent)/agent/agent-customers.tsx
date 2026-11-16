"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { AssignedCustomerRow } from "@multife/backend/modules/agents/types";
import { NewCustomerForm } from "@/components/agent/new-customer-form";
import { Alert } from "@/components/ui/alert";
import { inputClasses } from "@/components/ui/text-field";
import { matchesCustomer } from "@/lib/agent-customers";
import { formatOrderDate } from "@/lib/order-status";
import { startOrderFor } from "@/lib/order-draft";
import { formatPhone } from "@/lib/phone";

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
  const [added, setAdded] = useState<{ name: string; email: string } | null>(null);

  return (
    <section className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6 lg:sticky lg:top-32">
      <h2 className="font-display text-2xl text-ink">Add a customer</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        We&apos;ll email them an invite to set a password, so they can sign in and follow every order you place for
        them.
      </p>

      <div className="mt-5 space-y-4">
        {added && (
          <Alert tone="success">
            {added.name} has been added. We&apos;ve emailed an invite to {added.email} to set their password.
          </Alert>
        )}
        <NewCustomerForm
          idPrefix="customer"
          submitLabel="Add customer & send invite"
          onAdded={(c) => {
            setAdded({ name: c.name || "The customer", email: c.email });
            router.refresh();
          }}
        />
      </div>
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

  const visible = useMemo(() => customers.filter((c) => matchesCustomer(c, query)), [customers, query]);

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
