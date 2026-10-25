import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function OrderTopBar({ backHref, backLabel = "Back", storeName }: {
  backHref: string;
  backLabel?: string;
  storeName?: string | null;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/80 backdrop-blur-xl">
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href={backHref}
          aria-label={backLabel}
          className="flex h-11 w-11 items-center justify-center justify-self-start rounded-full border border-line bg-white text-ink transition-colors hover:border-cyan-bright/60 hover:text-ocean"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </Link>
        <Logo />
        <span className="justify-self-end truncate text-right text-sm font-semibold text-muted">
          {storeName}
        </span>
      </div>
    </header>
  );
}
