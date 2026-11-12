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
  // The order_drafts row (order module) for this exact fabric + template
  // (+ customer, when an agent orders); a different pair needs a new row.
  // Null for guests.
  remote: { id: string; fabricId: string; templateId: string; customerId?: string | null } | null;
  // Set when a signed-in agent is ordering for one of their customers
  // (FR-AGT-03). Kept across store/fabric changes until the order is placed
  // or the agent stops.
  actingFor: { customerId: string; name: string } | null;
};

const KEY = "multife:order-draft";
const EMPTY: Draft = {
  brandSlug: null,
  fabricId: null,
  templateId: null,
  selections: {},
  labels: {},
  remote: null,
  actingFor: null,
};

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
  write(same ? current : { ...EMPTY, brandSlug, fabricId, actingFor: current.actingFor });
}

// An agent starts a fresh order for one of their customers.
export function startOrderFor(customer: { customerId: string; name: string }) {
  load();
  write({ ...EMPTY, actingFor: customer });
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

// After the order is placed (or an agent stops ordering for a customer):
// the next order starts from scratch.
export function clearDraft() {
  load();
  write(EMPTY);
}
