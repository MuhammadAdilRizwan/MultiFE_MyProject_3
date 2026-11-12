"use server";

import { z } from "zod";
import { OrderNotCancellableError, cancelMyOrder } from "@multife/backend/modules/orders/cancelOrder";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { activeCustomer } from "@/lib/active-customer";
import { CANCEL_REASONS } from "@/lib/order-status";

// FR-CUS-14: the customer cancels their own order before cutting starts.
// The rule itself is fn_transition_order's; this only validates input,
// checks it's an active customer, and turns refusals into plain messages.

const schema = z
  .object({
    orderNumber: z.string().regex(/^MF-\d{4}-\d{6}$/),
    reason: z.enum(CANCEL_REASONS),
    note: z.string().trim().max(300, "Keep the note under 300 characters.").optional(),
  })
  .refine((v) => v.reason !== "Other" || (v.note?.length ?? 0) >= 3, { message: "Tell us briefly why you're cancelling.", path: ["note"] });

const TOO_LATE = "This order can no longer be cancelled — cutting has started. Please contact us if you need help.";

export async function cancelMyOrderAction(input: z.infer<typeof schema>): Promise<ActionResult<{ status: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Choose a reason for cancelling.");
  const { orderNumber, reason, note } = parsed.data;

  try {
    const me = await activeCustomer();
    if (!me) return fail("Sign in with your customer account to cancel this order.");
    const fullReason = note ? `${reason}: ${note}` : reason;
    return ok(await cancelMyOrder(me.supabase, { customerId: me.customerId, orderNumber, reason: fullReason }));
  } catch (error) {
    if (error instanceof OrderNotCancellableError) {
      return fail(error.reason === "not_found" ? "We couldn't find this order." : TOO_LATE);
    }
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    // A status change between page load and click (e.g. production started).
    if (message === "This order can no longer be cancelled") return fail(TOO_LATE);
    if (/is already cancelled/.test(message ?? "")) return fail("This order is already cancelled.");
    if (/is already/.test(message ?? "")) return fail(TOO_LATE);
    console.error("cancelMyOrder failed:", message ?? "unknown error");
    return fail("We couldn't cancel your order. Please try again.");
  }
}
