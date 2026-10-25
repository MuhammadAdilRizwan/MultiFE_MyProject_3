import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { buttonClasses } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { HeadingRule } from "@/components/ui/heading";

export const metadata: Metadata = { title: "Register your brand" };

// Brands don't sign themselves up: they contact the MultiFe admin, who
// onboards them after a conversation. The contact details are configuration
// (MULTIFE_CONTACT_EMAIL / MULTIFE_CONTACT_PHONE), never hard-coded.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function contactDetails() {
  const email = process.env.MULTIFE_CONTACT_EMAIL?.trim();
  const phone = process.env.MULTIFE_CONTACT_PHONE?.trim();
  return {
    email: email && EMAIL_PATTERN.test(email) ? email : null,
    phone: phone ? phone : null,
  };
}

const STEPS = [
  "Email us your brand name, a contact person and a short note about your fabric range.",
  "Our admin gets in touch to talk through how your fabric catalogue and stock will reach MultiFe.",
  "Once agreed, we set up your store and confirm which customizations each of your fabrics supports.",
];

export default function RegisterBrandPage() {
  const { email, phone } = contactDetails();
  const subject = encodeURIComponent("Brand registration on MultiFe");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean">For fabric brands</p>
          <h1 className="mt-2 font-display text-4xl leading-tight text-ink sm:text-5xl">Register your brand</h1>
          <HeadingRule align="left" className="mt-4" />
          <p className="mt-5 text-base leading-7 text-muted">
            Want your fabrics on MultiFe? Brand registration is handled personally by our admin team — get in
            touch and we&apos;ll take it from there.
          </p>

          <div className={`${cardClasses} mt-10 p-6 sm:p-8`}>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ocean">Contact the MultiFe admin</h2>
            {email || phone ? (
              <dl className="mt-5 space-y-4">
                {email && (
                  <div>
                    <dt className="text-sm text-muted">Email</dt>
                    <dd className="mt-1">
                      <a href={`mailto:${email}?subject=${subject}`} className="text-lg font-bold text-ink hover:text-ocean">
                        {email}
                      </a>
                    </dd>
                  </div>
                )}
                {phone && (
                  <div>
                    <dt className="text-sm text-muted">Phone</dt>
                    <dd className="mt-1">
                      <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="text-lg font-bold text-ink hover:text-ocean">
                        {phone}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-4 text-base leading-7 text-muted">Our contact details will be listed here shortly.</p>
            )}
            {email && (
              <a href={`mailto:${email}?subject=${subject}`} className={`${buttonClasses("primary")} mt-8 w-full sm:w-auto`}>
                Email the admin
              </a>
            )}
          </div>

          <h2 className="mt-12 text-lg font-extrabold tracking-tight text-ink">What happens next</h2>
          <ol className="mt-4 space-y-3">
            {STEPS.map((text, i) => (
              <li key={text} className="flex gap-4 rounded-2xl border border-line bg-white/80 p-4 shadow-card">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-mf-blue text-sm font-bold text-white">
                  {i + 1}
                </span>
                <p className="text-sm leading-6 text-muted">{text}</p>
              </li>
            ))}
          </ol>

          <Link href="/#brands" className="mt-10 inline-flex text-sm font-semibold text-ocean hover:underline">
            Back to brands
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
