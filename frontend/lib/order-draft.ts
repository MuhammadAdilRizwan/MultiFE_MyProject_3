"use client";

import { useSyncExternalStore } from "react";
import type { Selections } from "./customization";

// The order in progress, kept in sessionStorage so a refresh or a dropped
// connection doesn't lose the customer's choices (FR-CUS-13). Replaced by a
// server-side order_drafts row once the ordering backend exists.
// selections are { option_group key: option_value key }; labels keep the
// "Group: Value" text of each choice so a choice the store later stops
// offering can still be named in the warning.
export type Draft = {
  brandSlug: string | null;
  fabricId: string | null;
  templateId: string | null;
  selections: Selections;
  labels: Record<string, string>;
  // The signed-in customer's order_drafts row (order module) for this exact
  // fabric + template; a different pair needs a new row. Null for guests.
  remote: { id: string; fabricId: string; templateId: string } | null;
};

const KEY = "multife:order-draft";
const EMPTY: Draft = { brandSlug: null, fabricId: null, templateId: null, selections: {}, labels: {}, remote: null };

let current: Draft = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) current = { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    current = EMPTY;
  }
}

function write(next: Draft) {
  current = next;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage full — keep working in memory.
  }
  listeners.forEach((l) => l());
}

// The latest saved draft, for code outside React (lib/order-sync.ts).
export function readDraft(): Draft {
  load();
  return current;
}

export function updateDraft(patch: Partial<Draft>) {
  load();
  write({ ...current, ...patch });
}

export function setSelections(patch: Selections, labels: Record<string, string>) {
  load();
  write({
    ...current,
    selections: { ...current.selections, ...patch },
    labels: { ...current.labels, ...labels },
  });
}

// For choices whose whole group is no longer offered.
export function dropSelections(groupKeys: string[]) {
  load();
  const selections = { ...current.selections };
  const labels = { ...current.labels };
  for (const key of groupKeys) {
    delete selections[key];
    delete labels[key];
  }
  write({ ...current, selections, labels });
}

// Starting a different fabric or store resets downstream choices.
export function startDraft(brandSlug: string, fabricId: string) {
  load();
  const same = current.brandSlug === brandSlug && current.fabricId === fabricId;
  write(same ? current : { ...EMPTY, brandSlug, fabricId });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// Returns null during server render and the first client render, so pages can
// show a loading state instead of wrongly redirecting before storage is read.
export function useDraft(): Draft | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return current;
    },
    () => null,
  );
}
