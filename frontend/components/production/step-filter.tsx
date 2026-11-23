"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export type StepOption = { value: string; label: string; count: number };

// "To do" step filter as a dropdown. Choosing a step loads /production?step=…
// (the page filters on the server); "All steps" clears it.
export function StepFilter({ options, value, total }: { options: StepOption[]; value: string | null; total: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="step-filter" className="text-sm font-semibold text-ink">
        Show
      </label>
      <select
        id="step-filter"
        value={value ?? ""}
        disabled={pending}
        aria-busy={pending || undefined}
        onChange={(e) => {
          const step = e.target.value;
          startTransition(() => router.push(step ? `/production?step=${encodeURIComponent(step)}` : "/production"));
        }}
        className="h-11 min-w-0 flex-1 rounded-[14px] border border-line bg-white/90 px-4 pr-10 text-sm font-semibold text-ink shadow-[0_10px_22px_rgba(8,36,61,0.055)] transition-colors focus:border-cyan-bright focus:outline-none focus:ring-4 focus:ring-cyan-bright/20 disabled:opacity-60 sm:max-w-sm sm:flex-none"
      >
        <option value="">All steps ({total})</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
    </div>
  );
}
