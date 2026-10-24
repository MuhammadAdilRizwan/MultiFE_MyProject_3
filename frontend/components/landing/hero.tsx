import { buttonClasses } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { Eyebrow, HeadingRule } from "@/components/ui/heading";

export function Hero() {
  return (
    <section className="relative">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-10 lg:px-8 lg:py-28">
        <div className="text-center lg:text-left">
          <Eyebrow align="responsive">Made-to-measure, made simple</Eyebrow>

          <h1 className="mt-6 text-balance font-display text-[2.6rem] leading-[1.06] text-ink sm:text-5xl lg:text-6xl">
            Your perfect fit,
            <br />
            stitched and delivered.
          </h1>
          <HeadingRule align="responsive" />

          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-muted sm:text-lg lg:mx-0">
            Pick a fabric from a brand you trust, customize the style, and let your camera take
            your measurements. Our tailors approve every order before it&apos;s cut — so what
            arrives always fits.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <a href="#brands" className={`${buttonClasses("primary")} w-full sm:w-auto`}>
              See available brands
            </a>
            <a href="#how-it-works" className={`${buttonClasses("secondary")} w-full sm:w-auto`}>
              How it works
            </a>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
          <HeroJourneyCard />
        </div>
      </div>
    </section>
  );
}

function HeroJourneyCard() {
  const steps = [
    { label: "Choose fabric & style", icon: <FabricIcon /> },
    { label: "Confirm your measurements", icon: <ScanIcon /> },
    { label: "Tailor-approved before cutting", icon: <CheckIcon /> },
  ];

  return (
    <div className={`${cardClasses} p-5 sm:p-6`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-ink">How your order moves</span>
        <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
          Every step tracked
        </span>
      </div>

      <ul className="mt-5 space-y-4">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-mf-blue text-white shadow-blue">
              {step.icon}
            </span>
            <p className="text-sm font-semibold text-ink">{step.label}</p>
          </li>
        ))}
      </ul>

      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full w-2/3 rounded-full bg-mf-rule" />
      </div>
      <p className="mt-2 text-xs text-muted">From fabric to your door — no shop visit needed.</p>
    </div>
  );
}

function FabricIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" aria-hidden="true">
      <path
        d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" aria-hidden="true">
      <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
