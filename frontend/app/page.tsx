import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ValueProps } from "@/components/landing/value-props";
import { BrandsSection } from "@/components/landing/brands-section";

export default function Home() {
  return (
    <div className="relative isolate flex min-h-full flex-1 flex-col text-ink">
      {/* Fixed layer rather than background-attachment: fixed, which iOS Safari ignores. */}
      <div aria-hidden="true" className="bg-mf-page fixed inset-0 -z-10" />
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <ValueProps />
        <BrandsSection />
      </main>
      <SiteFooter />
    </div>
  );
}
