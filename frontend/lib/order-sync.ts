"use client";

import { createDraftAction, updateDraftOptionsAction } from "@/app/(order)/order-actions";
import type { ActionResult } from "./action-result";
import type { Selections } from "./customization";
import { readDraft, updateDraft } from "./order-draft";

// Signed-in customers keep their order in order_drafts (order module, FR-CUS-13)
// as well as in the browser. These keep the two in step; guests never call them.

// The database draft for the current fabric + template, created on first use
// (or again when the customer has since picked a different pair).
export async function ensureRemoteDraft(): Promise<ActionResult<string>> {
  const draft = readDraft();
  if (!draft.fabricId || !draft.templateId) return { ok: false, error: "Pick a fabric and template first." };
  const { remote } = draft;
  if (remote && remote.fabricId === draft.fabricId && remote.templateId === draft.templateId) {
    return { ok: true, data: remote.id };
  }

  const result = await createDraftAction({ fabricId: draft.fabricId, templateId: draft.templateId });
  if (!result.ok) return result;
  updateDraft({ remote: { id: result.data.id, fabricId: draft.fabricId, templateId: draft.templateId } });
  return { ok: true, data: result.data.id };
}

// Saves the chosen options on the database draft. `selections` must only hold
// options still offered — the server re-checks and rejects anything else.
export async function syncRemoteOptions(selections: Selections): Promise<ActionResult<string>> {
  const ensured = await ensureRemoteDraft();
  if (!ensured.ok) return ensured;
  const result = await updateDraftOptionsAction({ draftId: ensured.data, options: selections });
  return result.ok ? ensured : result;
}
