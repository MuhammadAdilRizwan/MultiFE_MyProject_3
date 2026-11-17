"use server";

import { z } from "zod";
import { confirmDelivery } from "@multife/backend/modules/fulfilment/confirmDelivery";
import { dispatchOrder } from "@multife/backend/modules/fulfilment/dispatchOrder";
import { listReadyToShip } from "@multife/backend/modules/fulfilment/listReadyToShip";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { describeError } from "@/lib/describe-error";
import { createClient } from "@/lib/supabase/server";

// Composes already-tested backend modules (fulfilment + users) — no
// business logic of its own, same convention as production-actions.ts.

function isDispatchOrAdmin(role: string): boolean {
  return role === "dispatch" || role === "admin";
}

export async function listReadyToShipAction(): Promise<ActionResult<Awaited<ReturnType<typeof listReadyToShip>>>> {
  try {
    const supabase = await createClient();

    const actor = await getCurrentProfile(supabase);
    if (!actor || !isDispatchOrAdmin(actor.role) || actor.status !== "active") {
      return fail("Sign in as dispatch to view the ready-to-ship queue.");
    }

    return ok(await listReadyToShip(supabase));
  } catch (error) {
    return fail(describeError(error));
  }
}

const dispatchOrderSchema = z.object({
  orderId: z.string().uuid(),
  courier: z.string().min(1),
  trackingRef: z.string().min(1),
});

export async function dispatchOrderAction(
  input: z.infer<typeof dispatchOrderSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof dispatchOrder>>>> {
  const parsed = dispatchOrderSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();

    const actor = await getCurrentProfile(supabase);
    if (!actor || !isDispatchOrAdmin(actor.role) || actor.status !== "active") {
      return fail("Only dispatch can mark an order dispatched.");
    }

    return ok(await dispatchOrder(supabase, parsed.data));
  } catch (error) {
    return fail(describeError(error));
  }
}

const confirmDeliverySchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().min(1).optional(),
});

export async function confirmDeliveryAction(
  input: z.infer<typeof confirmDeliverySchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof confirmDelivery>>>> {
  const parsed = confirmDeliverySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();

    const actor = await getCurrentProfile(supabase);
    if (!actor || !isDispatchOrAdmin(actor.role) || actor.status !== "active") {
      return fail("Only dispatch can confirm delivery.");
    }

    return ok(
      await confirmDelivery(supabase, {
        orderId: parsed.data.orderId,
        actorRole: actor.role,
        reason: parsed.data.reason,
      }),
    );
  } catch (error) {
    return fail(describeError(error));
  }
}
