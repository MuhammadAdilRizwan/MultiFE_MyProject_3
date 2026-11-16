"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssignedCustomerRow } from "@multife/backend/modules/agents/types";
import { listMyCustomersAction } from "@/app/(agent)/agent-actions";
import { StepSpinner } from "@/components/order/order-states";
import { Alert } from "@/components/ui/alert";
import { inputClasses } from "@/components/ui/text-field";
import { customerLabel, matchesCustomer } from "@/lib/agent-customers";
import { setActingFor } from "@/lib/order-draft";
import { formatPhone } from "@/lib/phone";
import { NewCustomerForm } from "./new-customer-form";

type Tab = "existing" | "new";

// FR-AGT-03: an agent who designed an order without choosing a customer first
// picks one of their customers, or adds a new one, here. The design in the
// browser is kept; the order screens then reload for that customer (the
// server checks the customer is assigned to this agent).
export function ChooseCustomer({ onChosen }: { onChosen?: () => void }) {
  const [tab, setTab] = useState<Tab>("existing");
  const [customers, setCustomers] = useState<AssignedCustomerRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    listMyCustomersAction()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setCustomers(result.data);
          if (result.data.length === 0) setTab("new");
        } else setLoadError(result.error);
      })
      .catch(() => !cancelled && setLoadError("We couldn't load your customers. Please try again."));
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => (customers ?? []).filter((c) => matchesCustomer(c, query)), [customers, query]);

  function choose(customerId: string, name: string) {
    setActingFor({ customerId, name });
    onChosen?.();
  }

  return (
    <section aria-labelledby="choose-customer-heading" className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
      <h2 id="choose-customer-heading" className="font-display text-2xl text-ink">
        Who is this order for?
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Your design is kept. Pick one of your customers, or add a new one, to continue to their measurements.
      </p>

      <div role="tablist" aria-label="Customer" className="mt-5 grid grid-cols-2 gap-1 rounded-full border border-line bg-cream/60 p-1">
        {(
          [
            ["existing", "My customers"],
            ["new", "New customer"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`h-10 rounded-full text-sm font-bold transition-colors ${
              tab === value ? "bg-mf-blue text-white shadow-blue" : "text-muted hover:text-ocean"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "new" ? (
          <>
            <p className="mb-4 text-sm leading-6 text-muted">
              We&apos;ll email them an invite to set a password, so they can follow this order from their own account.
            </p>
            <NewCustomerForm
              idPrefix="order-customer"
              submitLabel="Add customer & continue"
              onAdded={(c) => choose(c.customerId, c.name || c.email)}
            />
          </>
        ) : loadError ? (
          <Alert tone="danger">{loadError}</Alert>
        ) : !customers ? (
          <StepSpinner />
        ) : customers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-muted">
            You have no customers yet. Add one under &ldquo;New customer&rdquo;.
          </p>
        ) : (
          <>
            <label htmlFor="choose-customer-search" className="sr-only">
              Search customers
            </label>
            <input
              id="choose-customer-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email or number"
              className={`${inputClasses} h-11 text-sm`}
            />
            {visible.length === 0 ? (
              <p className="mt-4 text-center text-sm text-muted">No customers match &ldquo;{query}&rdquo;.</p>
            ) : (
              <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto">
                {visible.map((c) => {
                  const name = customerLabel(c.customer);
                  return (
                    <li key={c.id} className="flex items-center gap-3 py-3">
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-cyan-bright/10 font-display text-lg text-ocean"
                      >
                        {name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">{name}</p>
                        <p className="truncate text-xs text-muted">
                          {[c.customer?.email, formatPhone(c.customer?.phone)].filter(Boolean).join(" · ") || "No contact details"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => choose(c.customer_id, name)}
                        className="h-9 flex-none rounded-full border border-white/30 bg-mf-blue px-4 text-xs font-bold text-white shadow-blue transition-transform hover:-translate-y-px"
                      >
                        Select
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
