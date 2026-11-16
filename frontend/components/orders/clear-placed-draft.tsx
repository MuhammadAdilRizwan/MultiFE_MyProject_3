"use client";

import { useEffect } from "react";
import { clearDraft } from "@/lib/order-draft";

// The order confirmation clears the finished draft once it's on screen.
// Clearing it in checkout before navigating made the checkout page flash
// "Start by choosing a fabric" while this page loaded.
export function ClearPlacedDraft() {
  useEffect(() => {
    clearDraft();
  }, []);
  return null;
}
