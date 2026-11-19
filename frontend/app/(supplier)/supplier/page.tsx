import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { providerKindLabel } from "@multife/backend/modules/suppliers/types";
import { EmptyState, FabricStatusBadge, FabricThumb, PanelTitle, Stat } from "@/components/supplier/panel-parts";
import { Alert } from "@/components/ui/alert";
import { cardClasses } from "@/components/ui/card";
import { formatMetres } from "@/lib/catalog";
import { logMessage } from "@/lib/describe-error";
import { formatOrderDate } from "@/lib/order-status";
import { getMyConnection, getMyStore, listMyFabrics, type StoreConnection, type SyncRun } from "@/lib/supplier-panel";
import {
  CAPABILITY_LABELS,
  fabricStatus,
  isPlaceholderFabric,
  summariseFabrics,
  type PanelFabric,
} from "@/lib/supplier-panel-stats";

export const metadata: Metadata = { title: "Supplier overview" };

const STORE_STATUS: Record<string, { label: string; tone: string }> = {
  active: { label: "Live on MultiFe", tone: "bg-success-soft text-success" },
  pending: { label: "Not live yet", tone: "bg-warning-soft text-warning" },
  suspended: { label: "Paused by MultiFe", tone: "bg-danger-soft text-danger" },
};

export default async function SupplierOverviewPage() {
  const store = await getMyStore().catch(() => null);
  if (!store) return null; // the layout shows the "not linked" message

  let fabrics: PanelFabric[] | null = null;
  let link: { connection: StoreConnection | null; runs: SyncRun[] } | null = null;
  try {
    [fabrics, link] = await Promise.all([listMyFabrics(store.id), getMyConnection(store.id)]);
  } catch (error) {
    console.error("supplier overview failed:", logMessage(error));
  }

  const status = STORE_STATUS[store.status] ?? STORE_STATUS.pending;

  return (
    <div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {store.logoUrl && (
          <span className="relative h-16 w-16 flex-none overflow-hidden rounded-2xl border border-line bg-white">
            <Image src={store.logoUrl} alt="" fill sizes="64px" className="object-contain" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <PanelTitle
            title={store.name}
            description="Your fabrics on MultiFe, how much is held for customers' orders, and your store's connection."
          />
        </div>
        <span className={`self-start rounded-full px-3 py-1 text-xs font-bold sm:self-center ${status.tone}`}>{status.label}</span>
      </div>

      {fabrics === null || link === null ? (
        <div className="mt-8">
          <Alert tone="danger">We couldn&apos;t load your store&apos;s details. Please refresh to try again.</Alert>
        </div>
      ) : (
        <Overview fabrics={fabrics} connection={link.connection} runs={link.runs} />
      )}
    </div>
  );
}

function Overview({ fabrics, connection, runs }: { fabrics: PanelFabric[]; connection: StoreConnection | null; runs: SyncRun[] }) {
  const summary = summariseFabrics(fabrics);
  const placeholder = fabrics.some(isPlaceholderFabric);
  const attention = fabrics
    .filter((f) => {
      const s = fabricStatus(f);
      return s === "out_of_stock" || s === "low_stock";
    })
    .sort((a, b) => a.availableMetres - b.availableMetres)
    .slice(0, 5);

  return (
    <>
      {placeholder && (
        <div className="mt-6">
          <Alert tone="info">
            <strong>Placeholder catalogue.</strong> The fabrics, prices and stock shown here are demo data while your
            store&apos;s system isn&apos;t connected to MultiFe. Real figures will replace them once it is.
          </Alert>
        </div>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Fabrics listed" value={String(summary.total)} />
        <Stat
          label="On sale"
          value={String(summary.onSale)}
          hint={summary.notOnSale > 0 ? `${summary.notOnSale} not on sale` : undefined}
        />
        <Stat
          label="Low or out of stock"
          value={String(summary.lowStock + summary.outOfStock)}
          hint={summary.outOfStock > 0 ? `${summary.outOfStock} out of stock` : undefined}
        />
        <Stat label="Held for customers" value={formatMetres(summary.heldMetres)} hint={`of ${formatMetres(summary.stockMetres)} in stock`} />
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className={`${cardClasses} p-5 sm:p-6`} aria-labelledby="attention-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="attention-heading" className="text-base font-extrabold tracking-tight text-ink">
              Running low
            </h2>
            <Link href="/supplier/fabrics" className="text-sm font-semibold text-ocean hover:underline">
              All fabrics
            </Link>
          </div>
          {attention.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              {fabrics.length === 0 ? "No fabrics from your store yet." : "Every fabric on sale has enough stock."}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {attention.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-3">
                  <FabricThumb image={f.image} name={f.name} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{f.name}</span>
                    <span className="block text-xs text-muted">{formatMetres(f.availableMetres)} left to sell</span>
                  </span>
                  <FabricStatusBadge status={fabricStatus(f)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <ConnectionCard connection={connection} runs={runs} placeholder={placeholder} />
      </div>

      {fabrics.length === 0 && (
        <div className="mt-6">
          <EmptyState title="No fabrics from your store yet">
            They&apos;ll appear here once MultiFe adds your catalogue.
          </EmptyState>
        </div>
      )}
    </>
  );
}

const CONNECTION_STATUS: Record<StoreConnection["status"], { label: string; tone: string }> = {
  active: { label: "Connected", tone: "bg-success-soft text-success" },
  pending: { label: "Not connected yet", tone: "bg-warning-soft text-warning" },
  error: { label: "Connection problem", tone: "bg-danger-soft text-danger" },
};

function ConnectionCard({ connection, runs, placeholder }: { connection: StoreConnection | null; runs: SyncRun[]; placeholder: boolean }) {
  const status = connection ? CONNECTION_STATUS[connection.status] : CONNECTION_STATUS.pending;
  return (
    <section className={`${cardClasses} p-5 sm:p-6`} aria-labelledby="connection-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="connection-heading" className="text-base font-extrabold tracking-tight text-ink">
          Store connection
        </h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.tone}`}>{status.label}</span>
      </div>

      {!connection || connection.status === "pending" ? (
        <p className="mt-3 text-sm leading-6 text-muted">
          Your store&apos;s system isn&apos;t linked to MultiFe yet
          {placeholder ? ", so this panel shows placeholder data" : ""}. Once it is, your fabrics, prices and stock will
          update here automatically.
        </p>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted">
          {connection.lastSyncAt ? `Last updated ${formatOrderDate(connection.lastSyncAt)}.` : "No update received yet."}
          {connection.status === "error" && " MultiFe has been alerted and will be in touch."}
        </p>
      )}

      {connection && (
        <p className="mt-3 text-sm">
          <span className="text-muted">Connection type: </span>
          <span className="font-semibold text-ink">{providerKindLabel(connection.providerKind)}</span>
        </p>
      )}

      {connection && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {CAPABILITY_LABELS.map(([key, label]) => (
            <li key={key} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className={`h-2 w-2 flex-none rounded-full ${connection.capabilities[key] ? "bg-success" : "bg-line"}`}
              />
              <span className={connection.capabilities[key] ? "text-ink" : "text-muted"}>{label}</span>
              <span className="sr-only">{connection.capabilities[key] ? "(included)" : "(not included)"}</span>
            </li>
          ))}
        </ul>
      )}

      {runs.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Recent updates</h3>
          <ul className="mt-2 divide-y divide-line text-sm">
            {runs.map((r) => (
              <li key={r.startedAt} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-ink">{formatOrderDate(r.startedAt)}</span>
                <span className="text-muted">
                  {r.created} new · {r.updated} updated
                  {r.failed > 0 && <span className="text-danger"> · {r.failed} failed</span>}
                  {!r.finishedAt && " · running"}
                  {r.hasError && r.failed === 0 && <span className="text-danger"> · had a problem</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
