import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ValueProps } from "@/components/landing/value-props";
import { BrandsSection } from "@/components/landing/brands-section";
import { createClient } from "@/lib/supabase/server";

// Guests get the full intro; anyone signed in goes straight to the brands.
export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/brands");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <ValueProps />
        <HowItWorks />
        <BrandsSection />
      </main>
      <SiteFooter />
    </div>
  );
}
