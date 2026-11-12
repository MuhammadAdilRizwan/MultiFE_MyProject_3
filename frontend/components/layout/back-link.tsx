import Link from "next/link";

// A visible way back on pages without the order flow's top bar — phones have
// no browser back button on screen.
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white pl-2 pr-4 text-sm font-semibold text-ink shadow-sm transition-colors hover:border-cyan-bright/60 hover:text-ocean"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cream" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
      </span>
      {label}
    </Link>
  );
}
