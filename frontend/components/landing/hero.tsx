export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-surface to-ice">
      {/* Ambient glow accents — abstract, no stock imagery needed */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-[-10%] h-72 w-72 rounded-full bg-accent/20 blur-3xl sm:h-96 sm:w-96"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-20%] left-[-10%] h-64 w-64 rounded-full bg-warning/10 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-10 lg:px-8 lg:py-28">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-ocean ring-1 ring-inset ring-accent/20">
            Made-to-measure, made simple
          </span>

          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.02] text-navy sm:text-6xl lg:text-7xl">
            Your perfect fit,
            <br />
            stitched and delivered.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-muted-strong sm:text-lg lg:mx-0">
            Pick a fabric from a brand you trust, customize the style, and let
            your camera take your measurements. Our tailors approve every
            order before it&apos;s cut — so what arrives always fits.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <a
              href="#brands"
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent px-7 text-base font-semibold text-white shadow-glow transition-colors hover:bg-ocean sm:w-auto"
            >
              See available brands
            </a>
            <a
              href="#how-it-works"
              className="inline-flex h-12 w-full items-center justify-center rounded-full border border-line bg-surface px-7 text-base font-semibold text-navy transition-colors hover:bg-ice sm:w-auto"
            >
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
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft-lg sm:p-6">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-navy">
          How your order moves
        </span>
        <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
          Every step tracked
        </span>
      </div>

      <ul className="mt-5 space-y-4">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent/10 text-ocean">
              {step.icon}
            </span>
            <p className="text-sm font-semibold text-navy">
              {step.label}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-accent to-accent" />
      </div>
      <p className="mt-2 text-xs text-muted">
        From fabric to your door — no shop visit needed.
      </p>
    </div>
  );
}

function FabricIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" aria-hidden="true">
      <path
        d="M4 6h16M4 12h16M4 18h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
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
      <path
        d="m5 13 4 4L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
