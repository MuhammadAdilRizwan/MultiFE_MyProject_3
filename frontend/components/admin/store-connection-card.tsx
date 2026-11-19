"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  CAPABILITY_KEYS,
  PROVIDER_KIND_LABELS,
  PROVIDER_KINDS,
  type ProviderKind,
  type SupplierCapabilities,
  type SupplierIntegration,
} from "@multife/backend/modules/suppliers/types";
import { configureSupplierAction } from "@/app/(admin)/admin/stores/[id]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { formatOrderDate } from "@/lib/order-status";

// FR-ADM-03 / FR-FAB-13: how this store connects and what its system can do.
// Phase 1 runs on placeholder data, so this records the plan for the real
// connection; nothing syncs yet. No credentials field on purpose (FR-FAB-14).

const CAPABILITY_TEXT: Record<keyof SupplierCapabilities, { label: string; without: string }> = {
  catalogue_read: { label: "Sends its fabric catalogue", without: "Without it: MultiFe enters or imports the fabrics." },
  stock_read: { label: "Gives live stock", without: "Without it: stock comes from the last catalogue update." },
  order_write: { label: "Accepts fabric orders", without: "Without it: requirements are shown in the supplier panel." },
  status_callback: { label: "Sends supply updates", without: "Without it: the workshop confirms fabric received by hand." },
};

const KIND_HINTS: Record<ProviderKind, string> = {
  placeholder: "Demo catalogue for Phase 1. Not real store data.",
  manual: "MultiFe staff keep the fabrics up to date.",
  csv_import: "MultiFe imports the store's spreadsheet.",
  api: "The store's own system sends data to MultiFe (connector not built yet).",
};

const STATUS: Record<SupplierIntegration["status"], { label: string; tone: string }> = {
  pending: { label: "Not connected", tone: "bg-warning-soft text-warning" },
  active: { label: "Connected", tone: "bg-success-soft text-success" },
  error: { label: "Connection problem", tone: "bg-danger-soft text-danger" },
};

const NO_CAPABILITIES: SupplierCapabilities = { catalogue_read: false, stock_read: false, order_write: false, status_callback: false };

export function StoreConnectionCard({ storeId, integration }: { storeId: string; integration: SupplierIntegration | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<ProviderKind>(
    (PROVIDER_KINDS as readonly string[]).includes(integration?.providerKind ?? "")
      ? (integration!.providerKind as ProviderKind)
      : "placeholder",
  );
  const [baseUrl, setBaseUrl] = useState(integration?.baseUrl ?? "");
  const [caps, setCaps] = useState<SupplierCapabilities>(integration?.capabilities ?? NO_CAPABILITIES);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const status = STATUS[integration?.status ?? "pending"];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await configureSupplierAction({
        supplierId: storeId,
        providerKind: kind,
        baseUrl: kind === "api" ? baseUrl.trim() || undefined : undefined,
        capabilities: caps,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className={`${cardClasses} p-5 sm:p-6`} aria-labelledby="store-connection-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="store-connection-heading" className="text-base font-extrabold tracking-tight text-ink">
            Store connection
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {integration
              ? integration.lastSyncAt
                ? `Last update received ${formatOrderDate(integration.lastSyncAt)}.`
                : "No update received from the store yet."
              : "Not set up yet."}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.tone}`}>{status.label}</span>
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-5">
        <fieldset>
          <legend className="text-sm font-medium text-ink">Where the catalogue comes from</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {PROVIDER_KINDS.map((k) => (
              <label
                key={k}
                className={`flex cursor-pointer gap-3 rounded-2xl border p-3 transition-colors ${
                  kind === k ? "border-cyan-bright bg-cyan-bright/5" : "border-line bg-white hover:border-cyan-bright/60"
                }`}
              >
                <input
                  type="radio"
                  name="provider-kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="mt-1 h-4 w-4 flex-none accent-ocean"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">{PROVIDER_KIND_LABELS[k]}</span>
                  <span className="block text-xs leading-5 text-muted">{KIND_HINTS[k]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {kind === "api" && (
          <TextField
            id="store-api-url"
            label="Store's API address"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            optional
            hint="Keys and passwords are never entered here. They're kept in a secure store, set up with the developers."
          />
        )}

        <fieldset>
          <legend className="text-sm font-medium text-ink">What the store&apos;s system can do</legend>
          <ul className="mt-2 space-y-2">
            {CAPABILITY_KEYS.map((key) => (
              <li key={key}>
                <label className="flex cursor-pointer gap-3 rounded-2xl border border-line bg-white p-3 hover:border-cyan-bright/60">
                  <input
                    type="checkbox"
                    checked={caps[key]}
                    onChange={(e) => setCaps((c) => ({ ...c, [key]: e.target.checked }))}
                    className="mt-0.5 h-5 w-5 flex-none accent-ocean"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{CAPABILITY_TEXT[key].label}</span>
                    <span className="block text-xs leading-5 text-muted">{CAPABILITY_TEXT[key].without}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        {error && <Alert tone="danger">{error}</Alert>}
        {saved && !error && <Alert tone="success">Connection settings saved.</Alert>}

        <Button type="submit" pending={pending} pendingLabel="Saving…" className="w-full sm:w-auto">
          Save connection settings
        </Button>
      </form>
    </section>
  );
}
