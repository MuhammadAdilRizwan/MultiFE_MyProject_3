"use client";

import { useEffect, useState } from "react";
import { selectedOption, unsupportedChoices } from "@/lib/customization";
import { syncRemoteOptions } from "@/lib/order-sync";
import type { OrderContext } from "./order-gate";

export type SyncedDraft =
  | { status: "guest" }
  | { status: "agent-no-customer" }
  | { status: "repick" }
  | { status: "loading" }
  | { status: "ready"; draftId: string }
  | { status: "error"; error: string };

// The database draft (the signed-in customer's, or the one an agent keeps for
// their customer), holding exactly the design in the browser (covers a customer
// who designed as a guest and then signed in).
// Measurements and checkout act on this draft id.
export function useSyncedDraft(ctx: OrderContext): SyncedDraft {
  const { steps, draft, canSave, isAgent } = ctx;
  const needsRepick = unsupportedChoices(steps, draft.selections, draft.labels).some((c) => c.stepSlug);
  const selection = Object.fromEntries(
    steps.flatMap((s) => s.groups).map((g) => [g.id, selectedOption(g, draft.selections).id]),
  );
  const selectionKey = JSON.stringify(selection);
  const [synced, setSynced] = useState<{ key: string; result: SyncedDraft } | null>(null);

  useEffect(() => {
    if (!canSave || needsRepick) return;
    let cancelled = false;
    syncRemoteOptions(JSON.parse(selectionKey))
      .then((result) => {
        if (cancelled) return;
        setSynced({
          key: selectionKey,
          result: result.ok ? { status: "ready", draftId: result.data } : { status: "error", error: result.error },
        });
      })
      .catch(() => {
        if (!cancelled) setSynced({ key: selectionKey, result: { status: "error", error: "We couldn't load your order. Please try again." } });
      });
    return () => {
      cancelled = true;
    };
  }, [canSave, needsRepick, selectionKey]);

  if (!canSave) return isAgent ? { status: "agent-no-customer" } : { status: "guest" };
  if (needsRepick) return { status: "repick" };
  return synced?.key === selectionKey ? synced.result : { status: "loading" };
}
