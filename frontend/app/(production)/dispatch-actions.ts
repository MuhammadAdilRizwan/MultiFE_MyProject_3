"use server";

import { z } from "zod";
import { markCollected, markReadyForCollection } from "@multife/backend/modules/orders/collection";
import { dispatchOrder, markDelivered, reattemptDelivery, recordDeliveryFailure } from "@multife/backend/modules/orders/delivery";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { describeError } from "@/lib/describe-error";
import { kickNotifications } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

// Dispatch staff's delivery steps (FR-FUL-02..05). Composes the
// orders/delivery module; each database function re-checks the dispatch
// role and the shipment's state.

const NOT_DISPATCH = "Sign in as dispatch staff to manage deliveries.";

async function dispatchSession() {
  const supabase = await createClient();
  const actor = await getCurrentProfile(supabase);
  if (!actor || actor.role !== "dispatch" || actor.status !== "active") return null;
  return supabase;
}

const shipSchema = z.object({
  orderId: z.string().uuid(),
  courier: z.string().trim().min(2, "Enter the courier.").max(80, "Keep the courier name short."),
  trackingRef: z.string().trim().min(3, "Enter the tracking number.").max(80, "Keep the tracking number under 80 characters."),
});

export async function dispatchOrderAction(input: z.infer<typeof shipSchema>): Promise<ActionResult<{ status: string }>> {
  const parsed = shipSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    const supabase = await dispatchSession();
    if (!supabase) return fail(NOT_DISPATCH);
    const result = await dispatchOrder(supabase, parsed.data);
    kickNotifications();
    return ok(result);
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function reattemptDeliveryAction(input: z.infer<typeof shipSchema>): Promise<ActionResult<{ status: string }>> {
  const parsed = shipSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    const supabase = await dispatchSession();
    if (!supabase) return fail(NOT_DISPATCH);
    const shipment = await reattemptDelivery(supabase, parsed.data);
    kickNotifications();
    return ok({ status: shipment.status });
  } catch (error) {
    return fail(describeError(error));
  }
}

const orderSchema = z.object({ orderId: z.string().uuid() });

export async function markDeliveredAction(input: z.infer<typeof orderSchema>): Promise<ActionResult<{ status: string }>> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");
  try {
    const supabase = await dispatchSession();
    if (!supabase) return fail(NOT_DISPATCH);
    const result = await markDelivered(supabase, parsed.data.orderId);
    kickNotifications();
    return ok(result);
  } catch (error) {
    return fail(describeError(error));
  }
}

const failureSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(3, "Say why it couldn't be delivered.").max(300, "Keep the reason under 300 characters."),
});

export async function recordDeliveryFailureAction(input: z.infer<typeof failureSchema>): Promise<ActionResult<{ status: string }>> {
  const parsed = failureSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    const supabase = await dispatchSession();
    if (!supabase) return fail(NOT_DISPATCH);
    const shipment = await recordDeliveryFailure(supabase, parsed.data);
    kickNotifications();
    return ok({ status: shipment.status });
  } catch (error) {
    return fail(describeError(error));
  }
}

// FR-FUL-06: a collection order — ready (the customer is emailed), then
// handed over at the workshop, which completes it.
export async function markReadyForCollectionAction(input: z.infer<typeof orderSchema>): Promise<ActionResult<{ status: string }>> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");
  try {
    const supabase = await dispatchSession();
    if (!supabase) return fail(NOT_DISPATCH);
    const result = await markReadyForCollection(supabase, parsed.data.orderId);
    kickNotifications();
    return ok(result);
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function markCollectedAction(input: z.infer<typeof orderSchema>): Promise<ActionResult<{ status: string }>> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");
  try {
    const supabase = await dispatchSession();
    if (!supabase) return fail(NOT_DISPATCH);
    const result = await markCollected(supabase, parsed.data.orderId);
    kickNotifications();
    return ok(result);
  } catch (error) {
    return fail(describeError(error));
  }
}
