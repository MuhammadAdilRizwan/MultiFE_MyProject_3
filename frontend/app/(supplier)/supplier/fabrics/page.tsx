import type { Metadata } from "next";
import { PanelTitle } from "@/components/supplier/panel-parts";
import { Alert } from "@/components/ui/alert";
import { logMessage } from "@/lib/describe-error";
import { getMyStore, listMyFabrics } from "@/lib/supplier-panel";
import { isPlaceholderFabric, type PanelFabric } from "@/lib/supplier-panel-stats";
import { FabricList } from "./fabric-list";

export const metadata: Metadata = { title: "My fabrics" };

// Read-only: fabric data comes from the store's system (placeholder in
// Phase 1); MultiFe admins manage what's offered to customers.
export default async function SupplierFabricsPage() {
  const store = await getMyStore().catch(() => null);
  if (!store) return null;

  let fabrics: PanelFabric[] | null = null;
  try {
    fabrics = await listMyFabrics(store.id);
  } catch (error) {
    console.error("listMyFabrics failed:", logMessage(error));
  }

  return (
    <div>
      <PanelTitle
        title="My fabrics"
        description="Every fabric MultiFe lists from your store: price, stock on hand, how much is held for customers, and whether customers can order it."
      />
      {fabrics === null ? (
        <div className="mt-8">
          <Alert tone="danger">We couldn&apos;t load your fabrics. Please refresh to try again.</Alert>
        </div>
      ) : (
        <>
          {fabrics.some(isPlaceholderFabric) && (
            <div className="mt-6">
              <Alert tone="info">
                These are placeholder fabrics for the demo. Your real catalogue will replace them once your store&apos;s
                system is connected.
              </Alert>
            </div>
          )}
          <div className="mt-6">
            <FabricList fabrics={fabrics} />
          </div>
        </>
      )}
    </div>
  );
}
