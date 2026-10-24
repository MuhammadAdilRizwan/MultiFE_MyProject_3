import Image from "next/image";
import Link from "next/link";
import { listActiveBrands } from "@/lib/suppliers";

export async function BrandsSection() {
  const brands = await listActiveBrands();

  return (
    <section id="brands" className="bg-surface py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-ocean">
            Available brands
          </span>
          <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-navy sm:text-5xl">
            Shop fabric from brands we&apos;ve partnered with
          </h2>
          <p className="mt-4 text-base leading-7 text-muted">
            Pick a brand to see its fabric range, with live price and stock,
            and start your order from there.
          </p>
        </div>

        <div className="mt-12">
          {brands.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {brands.map((brand) => (
                <BrandCard key={brand.id} brand={brand} />
              ))}
            </div>
          ) : (
            <EmptyBrandsState />
          )}
        </div>
      </div>
    </section>
  );
}

function BrandCard({
  brand,
}: {
  brand: { name: string; slug: string; logoUrl: string | null };
}) {
  return (
    <Link
      href={`/s/${brand.slug}`}
      className="group flex items-center gap-4 rounded-2xl border border-line p-5 transition-all hover:-translate-y-0.5 hover:shadow-soft"
    >
      <span className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-xl bg-ice">
        {brand.logoUrl ? (
          <Image
            src={brand.logoUrl}
            alt={brand.name}
            width={56}
            height={56}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-lg font-bold text-hint">
            {brand.name.charAt(0)}
          </span>
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold text-navy">
          {brand.name}
        </p>
        <p className="mt-0.5 text-sm font-medium text-ocean transition-colors group-hover:text-ocean">
          Browse fabric →
        </p>
      </div>
    </Link>
  );
}

function EmptyBrandsState() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-dashed border-line bg-ice px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-ocean">
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
          <path
            d="M12 3v3m0 12v3m9-9h-3M6 12H3m14.5-6.5-2.1 2.1M8.6 15.4l-2.1 2.1m0-11 2.1 2.1m8.8 8.8 2.1 2.1"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </span>
      <h3 className="mt-5 text-lg font-semibold text-navy">
        We&apos;re onboarding our first fabric brands
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
        No brands are live on MultiFe just yet. As soon as a fabric partner
        joins, their catalogue will appear here automatically — check back
        soon, or ask your MultiFe agent for an update.
      </p>
    </div>
  );
}
