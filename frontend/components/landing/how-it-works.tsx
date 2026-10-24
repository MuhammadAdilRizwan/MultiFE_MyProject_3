import { cardClasses } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/heading";

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
    <section id="how-it-works" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="How it works"
          title="From fabric to your doorstep"
          description="One guided journey, four steps. No measuring tape, no shop visit."
        />

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <div
              key={step.number}
              className={`${cardClasses} p-6 transition-transform duration-200 hover:-translate-y-0.5`}
            >
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mf-blue text-white shadow-blue">
                  {step.icon}
                </span>
                <span className="text-sm font-bold tracking-[0.12em] text-orange">{step.number}</span>
              </div>
              <h3 className="mt-5 text-lg font-bold tracking-tight text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{step.description}</p>
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
