import type { Metadata } from "next";
import { EmptyState, FabricThumb, PanelTitle, Stat } from "@/components/supplier/panel-parts";
import { Alert } from "@/components/ui/alert";
import { cardClasses } from "@/components/ui/card";
import { formatMetres } from "@/lib/catalog";
import { logMessage } from "@/lib/describe-error";
import { getMyStore, listMyFabrics, listMyReservationSummary } from "@/lib/supplier-panel";
import { buildRequirements, isPlaceholderFabric, type PanelFabric, type ReservationSummaryRow } from "@/lib/supplier-panel-stats";

export const metadata: Metadata = { title: "Fabric needed" };

// Supply requirements (SDS §2.1). Totals per fabric only: no order numbers,
// customers, measurements or prices reach a supplier contact (FR-AUTH-07).
export default async function SupplierRequirementsPage() {
  const store = await getMyStore().catch(() => null);
  if (!store) return null;

  let data: { fabrics: PanelFabric[]; rows: ReservationSummaryRow[] } | null = null;
  try {
    const [fabrics, rows] = await Promise.all([listMyFabrics(store.id), listMyReservationSummary(store.id)]);
    data = { fabrics, rows };
  } catch (error) {
    console.error("supplier requirements failed:", logMessage(error));
  }

  return (
    <div>
      <PanelTitle
        title="Fabric needed"
        description="How much of each fabric customers' orders need from you. Orders are counted until the fabric is cut at the MultiFe workshop."
      />
      {data === null ? (
        <div className="mt-8">
          <Alert tone="danger">We couldn&apos;t load your fabric requirements. Please refresh to try again.</Alert>
        </div>
      ) : (
        <Requirements fabrics={data.fabrics} rows={data.rows} />
      )}
    </div>
  );
}

function Requirements({ fabrics, rows }: { fabrics: PanelFabric[]; rows: ReservationSummaryRow[] }) {
  const { items, totals } = buildRequirements(fabrics, rows);

  return (
    <>
      {fabrics.some(isPlaceholderFabric) && (
        <div className="mt-6">
          <Alert tone="info">
            Based on demo orders against the placeholder catalogue. Once your store is connected, MultiFe will also send
            these requirements to your system.
          </Alert>
        </div>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="For orders"
          value={formatMetres(totals.forOrdersMetres)}
          hint={`${totals.forOrdersCount} ${totals.forOrdersCount === 1 ? "order" : "orders"} not yet cut`}
        />
        <Stat label="In checkout now" value={formatMetres(totals.inCheckoutMetres)} hint="May turn into orders shortly" />
        <Stat
          label="Already cut"
          value={formatMetres(totals.cutMetres)}
          hint={`${totals.cutCount} ${totals.cutCount === 1 ? "order" : "orders"} so far`}
        />
      </dl>

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No fabric needed right now">When customers order your fabrics, the metres will show here.</EmptyState>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((i) => (
            <li key={i.fabricId} className={`${cardClasses} p-4 sm:p-5`}>
              <div className="flex gap-4">
                <FabricThumb image={i.image} name={i.name} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-extrabold tracking-tight text-ink">{i.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    Code {i.externalId} · {formatMetres(i.stockMetres)} in stock
                  </p>
                  <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-muted">For orders</dt>
                      <dd className="font-semibold text-ink">
                        {formatMetres(i.forOrdersMetres)}
                        {i.forOrdersCount > 0 && (
                          <span className="font-normal text-muted">
                            {" "}
                            · {i.forOrdersCount} {i.forOrdersCount === 1 ? "order" : "orders"}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">In checkout now</dt>
                      <dd className="font-semibold text-ink">{formatMetres(i.inCheckoutMetres)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Already cut</dt>
                      <dd className="font-semibold text-ink">{formatMetres(i.cutMetres)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
