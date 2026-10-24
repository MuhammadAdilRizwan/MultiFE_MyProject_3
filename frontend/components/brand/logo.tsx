import Link from "next/link";

type Tone = "navy" | "gradient";

const markTone: Record<Tone, string> = {
  navy: "bg-navy",
  gradient: "bg-mf-blue shadow-blue",
};

export function LogoMark({ className = "h-9 w-9", tone = "navy" }: { className?: string; tone?: Tone }) {
  return (
    <span
      className={`flex flex-none items-center justify-center rounded-xl text-white ${markTone[tone]} ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-1/2 w-1/2" aria-hidden="true">
        <path d="M12 2.5c1.5 2 1.5 3.7 0 5.5-1.5-1.8-1.5-3.5 0-5.5Z" fill="currentColor" />
        <path d="M5 9.5 12 6l7 3.5-1.6 2.3L12 10l-5.4 1.8L5 9.5Z" fill="currentColor" />
        <path
          d="M7 12.2v8.3c0 .6.4 1 1 1h8c.6 0 1-.4 1-1v-8.3l-5-1.6-5 1.6Z"
          fill="currentColor"
          opacity="0.9"
        />
      </svg>
    </span>
  );
}

export function Logo({ tone = "navy" }: { tone?: Tone }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="MultiFe home">
      <LogoMark tone={tone} />
      <span
        className={`font-display text-2xl font-semibold tracking-tight ${tone === "gradient" ? "text-ink" : "text-navy"}`}
      >
        MultiFe
      </span>
    </Link>
  );
}
