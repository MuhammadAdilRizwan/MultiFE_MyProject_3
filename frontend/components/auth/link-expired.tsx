import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export function LinkExpired({
  message,
  actionHref,
  actionLabel,
}: {
  message: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-soft text-warning">
        <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <p className="mt-5 text-sm leading-6 text-muted">{message}</p>
      <Link href={actionHref} className={`${buttonClasses("primary")} mt-6 w-full`}>
        {actionLabel}
      </Link>
    </div>
  );
}
