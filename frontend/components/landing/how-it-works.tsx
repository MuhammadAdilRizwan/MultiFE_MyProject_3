const steps = [
  {
    number: "01",
    title: "Pick your fabric",
    description:
      "Browse fabric from our partner brands with live price and stock, so you always know what's actually available.",
    icon: <SwatchIcon />,
  },
  {
    number: "02",
    title: "Customize your style",
    description:
      "Choose a garment template and the options your fabric supports — neckline, sleeve, cuff and more.",
    icon: <StyleIcon />,
  },
  {
    number: "03",
    title: "Get measured by AI",
    description:
      "A guided camera scan estimates your measurements right in your browser. Adjust anything before you confirm.",
    icon: <CameraIcon />,
  },
  {
    number: "04",
    title: "We stitch & deliver",
    description:
      "A tailor approves your measurements before any fabric is cut, then your garment is stitched, checked and shipped.",
    icon: <TruckIcon />,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-surface py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-ocean">
            How it works
          </span>
          <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-navy sm:text-5xl">
            From fabric to your doorstep
          </h2>
          <p className="mt-4 text-base leading-7 text-muted">
            One guided journey, four steps. No measuring tape, no shop visit.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <div
              key={step.number}
              className="group relative rounded-2xl border border-line bg-ice p-6 transition-shadow hover:shadow-soft"
            >
              <span className="text-xs font-bold tracking-widest text-hint">
                {step.number}
              </span>
              <span className="mt-4 flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-accent">
                {step.icon}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-navy">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function iconProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    className: "h-5 w-5",
    "aria-hidden": true as const,
  };
}

function SwatchIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3.5" y="3.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12.5" y="3.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
      <rect x="3.5" y="12.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" opacity="0.25" />
    </svg>
  );
}

function StyleIcon() {
  return (
    <svg {...iconProps()}>
      <path
        d="M9 4 7 7l1 2-1.5 10.5h11L15 9l1-2-2-3-2 2-3-2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 7 9.5 4.5h5L16 7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="13.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg {...iconProps()}>
      <path
        d="M3 7h10v9H3V7Zm10 3h4l3 3v3h-7v-6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="18.5" r="1.6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="18.5" r="1.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
