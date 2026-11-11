import type { Metadata } from "next";
import { BrandsSection } from "@/components/landing/brands-section";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = { title: "Brands" };

// Where signed-in users start: straight to the brands, without the intro
// landing page (guests still see that at "/").
export default function BrandsPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">
        <BrandsSection />
      </main>
      <SiteFooter />
    </div>
  );
}
