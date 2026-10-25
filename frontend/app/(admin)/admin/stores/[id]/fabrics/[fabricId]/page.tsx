import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFabricAction, listFabricsAction } from "@/app/(storefront)/catalog-actions";
import { CustomizationReview } from "@/components/admin/customization-review";
import { Alert } from "@/components/ui/alert";
import { HeadingRule } from "@/components/ui/heading";
import { getSupplierForAdmin, listOptionVocabulary, vocabularyAsOffered } from "@/lib/admin-catalog";
import { fabricName } from "@/lib/catalog";
import { buildSteps } from "@/lib/customization";

export const metadata: Metadata = { title: "Confirm customizations" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function FabricCustomizationPage({ params }: { params: Promise<{ id: string; fabricId: string }> }) {
  const { id, fabricId } = await params;
  if (!UUID.test(id) || !UUID.test(fabricId)) notFound();

  const [supplier, fabricResult] = await Promise.all([getSupplierForAdmin(id), getFabricAction({ fabricId })]);
  if (!supplier || !fabricResult.ok || fabricResult.data.supplier_id !== supplier.id) notFound();
  const fabric = fabricResult.data;

  const [vocabulary, siblingsResult] = await Promise.all([
    listOptionVocabulary().catch(() => null),
    listFabricsAction({ supplierId: supplier.id }),
  ]);

  // Only keys that are in our customization list can be ticked or saved.
  const known = new Set((vocabulary ?? []).flatMap((g) => g.values.map((v) => `${g.key}|${v.key}`)));
  const keep = (supported: Record<string, string[]>) =>
    Object.fromEntries(
      Object.entries(supported ?? {})
        .map(([g, values]) => [g, values.filter((v) => known.has(`${g}|${v}`))] as const)
        .filter(([, values]) => values.length > 0),
    );
  const unknownCount = Object.entries(fabric.supported_options ?? {}).reduce(
    (n, [g, values]) => n + values.filter((v) => !known.has(`${g}|${v}`)).length,
    0,
  );
  const others = (siblingsResult.ok ? siblingsResult.data : [])
    .filter((f) => f.id !== fabric.id && Object.keys(keep(f.supported_options)).length > 0)
    .map((f) => ({ id: f.id, name: fabricName(f), supportedOptions: keep(f.supported_options) }));

  return (
    <div>
      <Link href={`/admin/stores/${supplier.id}`} className="text-sm font-semibold text-ocean hover:underline">
        ← {supplier.name} fabrics
      </Link>
      <div className="mt-3 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean">Confirm customizations</p>
        <h1 className="mt-1 font-display text-3xl leading-tight text-ink sm:text-4xl">{fabricName(fabric)}</h1>
        <HeadingRule align="left" className="mt-4" />
        <p className="mt-4 text-base leading-7 text-muted">
          Tick every option {supplier.name} offers for this fabric. Customers will only see the ticked options.
          Once the store&apos;s catalogue feed is connected, the options it lists will arrive pre-ticked here for you
          to check.
        </p>
      </div>

      <div className="mt-8">
        {vocabulary ? (
          <CustomizationReview
            fabric={{ id: fabric.id, isAvailable: fabric.is_available }}
            initial={keep(fabric.supported_options)}
            unknownCount={unknownCount}
            steps={buildSteps(vocabularyAsOffered(vocabulary))}
            others={others}
          />
        ) : (
          <Alert tone="danger">We couldn&apos;t load the customization list. Please refresh.</Alert>
        )}
      </div>
    </div>
  );
}
