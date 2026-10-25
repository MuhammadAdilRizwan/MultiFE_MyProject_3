import Link from "next/link";
import { BrandBanner, BrandLogo } from "@/components/order/brand-mark";
import { SectionHeading } from "@/components/ui/heading";
import { BRANDS, brandFabrics, type Brand } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";

// Real lead-time range from the published templates in the database.
async function leadTimeRange(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("dress_templates").select("lead_days").eq("is_published", true);
  if (!data?.length) return null;
  const days = data.map((r) => r.lead_days as number);
  const [min, max] = [Math.min(...days), Math.max(...days)];
  return min === max ? `${min} days` : `${min}–${max} days`;
}

export async function BrandsSection() {
  // TODO(backend): replace BRANDS with the live supplier list once it's connected.
  const leadTime = await leadTimeRange();

  return (
    <section id="brands" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Available brands"
          title="Shop fabric from brands we've partnered with"
          description="Pick a brand to see its fabric range, with live price and stock, and start your order from there."
        />

        <ul className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {BRANDS.map((brand) => (
            <li key={brand.id}>
              <StoreCard brand={brand} leadTime={leadTime} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function StoreCard({ brand, leadTime }: { brand: Brand; leadTime: string | null }) {
  const fabrics = brandFabrics(brand);
  const tags = fabrics.slice(0, 3).map((f) => f.name);
  const more = fabrics.length - tags.length;

  return (
    <Link
      href={`/s/${brand.slug}`}
      className="group block overflow-hidden rounded-3xl border border-line bg-white shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(16,35,63,0.12)] focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-bright/30"
    >
      <BrandBanner bannerUrl={brand.bannerUrl} className="h-24" />
      <div className="px-5 pb-5">
        <BrandLogo name={brand.name} logoUrl={brand.logoUrl} className="-mt-9 h-[72px] w-[72px]" />
        <h3 className="mt-3 text-xl font-extrabold tracking-tight text-ink">{brand.name}</h3>

        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Fabrics">
          {tags.map((t) => (
            <li key={t} className="rounded-full bg-cyan-bright/10 px-3 py-1 text-xs font-semibold text-ocean">
              {t}
            </li>
          ))}
          {more > 0 && (
            <li className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-muted">+{more} more</li>
          )}
        </ul>

        <div className="mt-5 flex items-center gap-3 border-t border-line pt-4 text-sm">
          <span className="rounded-md bg-success-soft px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-success">
            New
          </span>
          <span className="font-semibold text-muted">{fabrics.length} fabrics</span>
          {leadTime && (
            <span className="flex items-center gap-1.5 font-semibold text-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-ocean" aria-hidden="true">
                <path d="M3 6.5h10.5v9H3zM13.5 10H17l3.5 3.5v2h-7" />
                <circle cx="7" cy="17.5" r="1.7" />
                <circle cx="17" cy="17.5" r="1.7" />
              </svg>
              {leadTime}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 font-bold text-ocean">
            Visit
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
