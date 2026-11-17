import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { PrintButton } from "@/components/ui/print-button";
import { Alert } from "@/components/ui/alert";
import { storefrontUrl } from "@/lib/storefront";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Storefront poster" };

const UUID = /^[0-9a-f-]{36}$/i;

// FR-ADM-04: a printable counter poster for a store's storefront — its logo,
// name and QR code. "Print / save as PDF" uses the browser's print dialog.
export default async function StorefrontPosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  // Admin session ("suppliers: admin all").
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("id, name, slug, logo_url").eq("id", id).maybeSingle();
  if (!data) notFound();
  const store = data as { id: string; name: string; slug: string; logo_url: string | null };

  const url = storefrontUrl(store.slug);
  if (!url) return <Alert tone="danger">Set NEXT_PUBLIC_SITE_URL on the server to make the storefront QR code.</Alert>;
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: "H", margin: 1, width: 640 });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/admin/stores/${store.id}`} className="text-sm font-semibold text-ocean hover:underline">
          ← {store.name}
        </Link>
        <PrintButton label="Print / save as PDF" />
      </div>

      <section className="mx-auto mt-6 max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-card print:mt-0 print:max-w-none print:border-0 print:shadow-none">
        {store.logo_url && (
          <div className="relative mx-auto h-20 w-20 overflow-hidden rounded-2xl">
            <Image src={store.logo_url} alt="" fill sizes="80px" className="object-contain" />
          </div>
        )}
        <h1 className="mt-4 font-display text-3xl text-ink">{store.name}</h1>
        <p className="mt-2 text-base text-muted">Custom-stitched outfits in {store.name} fabrics, made to your measurements.</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
        <img src={qr} alt={`QR code for ${url}`} width={320} height={320} className="mx-auto mt-6 h-72 w-72" />
        <p className="mt-4 text-lg font-bold text-ink">Scan to browse fabrics and order</p>
        <p className="mt-1 break-all font-mono text-xs text-muted">{url}</p>
        <p className="mt-6 text-sm font-semibold text-ocean">MultiFe</p>
      </section>
    </div>
  );
}
