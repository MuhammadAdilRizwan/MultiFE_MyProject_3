"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FabricRow } from "@multife/backend/modules/catalog/types";
import { setFabricAvailabilityAction } from "@/app/(admin)/catalog-actions";
import { Alert } from "@/components/ui/alert";
import { cardClasses } from "@/components/ui/card";
import { fabricName, formatMetres, formatPKR } from "@/lib/catalog";

const optionCount = (fabric: FabricRow) =>
  Object.values(fabric.supported_options ?? {}).reduce((n, values) => n + values.length, 0);

export function StoreFabrics({ supplierId, fabrics }: { supplierId: string; fabrics: FabricRow[] }) {
  if (fabrics.length === 0) {
    return (
      <div className={`${cardClasses} p-8 text-center`}>
        <p className="text-base font-semibold text-ink">No fabrics from this store yet.</p>
        <p className="mt-2 text-sm text-muted">They&apos;ll appear here once the store&apos;s catalogue is synced.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {fabrics.map((f) => (
        <FabricRowItem key={f.id} supplierId={supplierId} fabric={f} />
      ))}
    </ul>
  );
}

function FabricRowItem({ supplierId, fabric }: { supplierId: string; fabric: FabricRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const count = optionCount(fabric);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setFabricAvailabilityAction({ fabricId: fabric.id, isAvailable: !fabric.is_available });
      if (!result.ok) {
        setError(
          result.error.includes("FR-TPL-10")
            ? "Confirm at least one customization before making this fabric available."
            : result.error,
        );
      }
      router.refresh();
    });
  }

  return (
    <li className={`${cardClasses} p-4 sm:p-5`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-base font-extrabold tracking-tight text-ink">{fabricName(fabric)}</p>
          <p className="mt-0.5 text-sm text-muted">
            {formatPKR(fabric.price_per_metre)} / m · {formatMetres(fabric.stock_metres)} in stock
            {fabric.is_hidden && " · Hidden"}
          </p>
          <p className="mt-2">
            {count > 0 ? (
              <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success">
                {count} {count === 1 ? "customization" : "customizations"} confirmed
              </span>
            ) : (
              <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning">
                Customizations not confirmed
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={fabric.is_available}
              disabled={pending}
              onChange={toggle}
              className="h-5 w-5 accent-ocean"
            />
            Available to customers
          </label>
          <Link
            href={`/admin/stores/${supplierId}/fabrics/${fabric.id}`}
            className="rounded-full border border-white/30 bg-mf-blue px-4 py-2 text-sm font-bold text-white shadow-blue"
          >
            {count > 0 ? "Edit customizations" : "Confirm customizations"}
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
