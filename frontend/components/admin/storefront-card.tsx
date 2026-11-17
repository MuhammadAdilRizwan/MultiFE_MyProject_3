"use client";

import Link from "next/link";
import { useState } from "react";

// FR-ADM-04 / FR-CUS-01: a store's storefront (its brand page) and the QR
// code that opens it. The image comes from GET /api/storefronts/[slug]/qr.
export function StorefrontCard({
  storeId,
  slug,
  url,
  live,
}: {
  storeId: string;
  slug: string;
  url: string | null;
  live: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const button =
    "inline-flex h-10 items-center rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink shadow-sm transition-colors hover:border-cyan-bright/60 hover:text-ocean";

  return (
    <section aria-labelledby="storefront-heading" className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- an admin-only API image, not an optimisable asset
          <img
            src={`/api/storefronts/${slug}/qr?format=svg`}
            alt={`QR code for ${url}`}
            width={144}
            height={144}
            className="h-36 w-36 flex-none rounded-2xl border border-line bg-white p-2"
          />
        )}
        <div className="min-w-0 flex-1">
          <h2 id="storefront-heading" className="font-display text-2xl text-ink">
            Storefront &amp; QR code
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Print the QR code for the shop counter: scanning it opens this brand&apos;s page with its fabrics.
          </p>
          {!live && (
            <p className="mt-2 text-sm font-semibold text-warning">This store isn&apos;t active, so customers who scan it see &ldquo;not found&rdquo; until it is.</p>
          )}
          {url ? (
            <>
              <p className="mt-3 break-all rounded-xl bg-cream/70 px-3 py-2 font-mono text-xs text-ink">{url}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={copy} className={button}>
                  {copied ? "Copied" : "Copy link"}
                </button>
                <a href={url} target="_blank" rel="noopener noreferrer" className={button}>
                  Open storefront
                </a>
                <a href={`/api/storefronts/${slug}/qr?download=1`} className={button}>
                  Download QR (PNG)
                </a>
                <Link href={`/admin/stores/${storeId}/poster`} className={button}>
                  Print poster / PDF
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-danger">Set NEXT_PUBLIC_SITE_URL on the server to make the storefront link and QR code.</p>
          )}
        </div>
      </div>
    </section>
  );
}
