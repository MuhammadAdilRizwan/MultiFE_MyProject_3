import Link from "next/link";
import type { ReactNode } from "react";

export function CheckEmail({ email, children }: { email: string; children: ReactNode }) {
  return (
    <div className="text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-mf-blue text-white shadow-blue">
        <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h2 className="mt-5 text-lg font-semibold text-ink">Check your inbox</h2>
      <p className="mt-1 break-all text-sm font-medium text-ocean">{email}</p>
      <p className="mt-3 text-sm leading-6 text-muted">{children}</p>
      <p className="mt-6 text-sm text-muted">
        Wrong email or nothing arrived?{" "}
        <Link href="/sign-in" className="font-semibold text-ocean underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
