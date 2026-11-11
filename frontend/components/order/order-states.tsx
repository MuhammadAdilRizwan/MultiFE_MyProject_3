import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

// Shared states for the order steps that need a signed-in customer's draft.

export function StepPrompt({ text, href, action }: { text: string; href: string; action: string }) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-card">
      <p className="text-base leading-7 text-muted">{text}</p>
      <Link href={href} className={`${buttonClasses("primary")} mt-6 w-full`}>
        {action}
      </Link>
    </div>
  );
}

export function StepSpinner() {
  return (
    <div className="flex justify-center py-16" role="status" aria-label="Loading">
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-cyan-bright" />
    </div>
  );
}
