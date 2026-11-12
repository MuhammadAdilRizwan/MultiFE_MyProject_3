"use client";

import { useRouter } from "next/navigation";
import { clearDraft, useDraft } from "@/lib/order-draft";

// Shown across the store and order screens while a signed-in agent is
// ordering for one of their customers (FR-AGT-03), so they never lose track
// of who the order is for.
export function ActingForBar() {
  const router = useRouter();
  const draft = useDraft();
  if (!draft?.actingFor) return null;

  function stop() {
    clearDraft();
    router.push("/agent");
  }

  return (
    <div className="border-t border-cyan-bright/30 bg-cyan-bright/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 text-sm sm:px-6 lg:px-8">
        <p className="min-w-0 truncate text-ink">
          <span className="font-semibold text-ocean">Agent order</span> · Ordering for{" "}
          <span className="font-bold">{draft.actingFor.name}</span>
        </p>
        <button type="button" onClick={stop} className="flex-none font-semibold text-ocean hover:underline">
          Stop
        </button>
      </div>
    </div>
  );
}
