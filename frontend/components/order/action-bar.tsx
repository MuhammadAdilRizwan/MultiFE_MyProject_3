import Link from "next/link";
import type { ReactNode } from "react";

// Sticky bottom bar holding the step's main action, like the prototype's footer.
export function ActionBar({ children, backHref, backLabel = "Back" }: {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="sticky bottom-0 z-30 border-t border-line bg-white/85 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md flex-col items-center gap-1 px-4">
        {children}
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-ocean hover:underline"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
            {backLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
