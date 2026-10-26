import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { HeadingRule } from "@/components/ui/heading";
import { listSuppliersForAdmin, type AdminSupplier } from "@/lib/admin-catalog";
import { AddStoreForm, StoreList } from "./stores-manager";

export const metadata: Metadata = { title: "Stores" };

export default async function StoresPage() {
  let suppliers: AdminSupplier[] | null = null;
  try {
    suppliers = await listSuppliersForAdmin();
  } catch (error) {
    // Let Next's own control-flow errors (dynamic rendering, redirects) through.
    unstable_rethrow(error);
    console.error("listSuppliersForAdmin failed:", error instanceof Error ? error.message : error);
  }

  return (
    <div>
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">Stores</h1>
        <HeadingRule align="left" className="mt-4" />
        <p className="mt-4 text-base leading-7 text-muted">
          Partner brands and their fabrics. Open a store to confirm which customizations each fabric supports —
          customers only ever see what you&apos;ve confirmed.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        {suppliers ? <StoreList suppliers={suppliers} /> : <Alert tone="danger">We couldn&apos;t load the stores. Please refresh.</Alert>}
        <AddStoreForm />
      </div>
    </div>
  );
}
