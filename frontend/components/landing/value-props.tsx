const values = [
  {
    title: "Made to your measurements",
    description:
      "Every garment is cut to your own body, not picked off a size chart — so it fits the way made-to-measure should.",
    icon: <RulerIcon />,
    accent: "cyan",
  },
  {
    title: "No shop visit needed",
    description:
      "A guided camera scan takes your measurements from wherever you are. Prefer a person? An agent can measure you instead.",
    icon: <PhoneIcon />,
    accent: "orange",
  },
  {
    title: "Tailor-approved, always",
    description:
      "Nothing is cut until a tailor checks your measurements are safe to work with — protecting your fabric and your fit.",
    icon: <BadgeIcon />,
    accent: "green",
  },
  {
    title: "Tracked, start to finish",
    description:
      "Follow your order through cutting, stitching and quality checks, right up to the courier at your door.",
    icon: <RouteIcon />,
    accent: "cyan",
  },
];

const accentClasses: Record<string, string> = {
  cyan: "bg-accent/10 text-ocean",
  orange: "bg-warning/10 text-warning",
  green: "bg-success/10 text-success",
};

export function ValueProps() {
  return (
    <section id="why-multife" className="bg-ice-strong py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-ocean">
            Why MultiFe
          </span>
          <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-navy sm:text-5xl">
            Precision tailoring, without the fitting room
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {values.map((value) => (
            <div
              key={value.title}
              className="flex gap-4 rounded-2xl bg-surface p-6 shadow-soft"
            >
              <span
                className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${accentClasses[value.accent]}`}
              >
                {value.icon}
              </span>
              <div>
                <h3 className="text-base font-semibold text-navy">
                  {value.title}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-muted">
                  {value.description}
                </p>
              </div>
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

function RulerIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="8" width="18" height="8" rx="1.5" transform="rotate(-8 12 12)" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9.5v2M10.5 9v2.3M14 8.6v2M17.5 8.2v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="6.5" y="3" width="11" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 18h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function BadgeIcon() {
  return (
    <svg {...iconProps()}>
      <path
        d="M12 3.5 15 5l3 .5.5 3 1.5 2.5-1.5 2.5-.5 3-3 .5-3 1.5-3-1.5-3-.5-.5-3L3 11l1.5-2.5.5-3L8 5l4-1.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="18" r="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6 8c0 5 12 1 12 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="2.5 2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
