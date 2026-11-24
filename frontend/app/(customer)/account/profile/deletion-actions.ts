"use server";

import { z } from "zod";
import {
  getMyDeletionState,
  requestAccountDeletion,
  withdrawAccountDeletion,
  type MyDeletionState,
} from "@multife/backend/modules/users/accountDeletion";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { activeCustomer } from "@/lib/active-customer";

// FR-AUTH-09: the customer asks to delete their account, or withdraws the
// request. Session client only; the database functions re-check that the
// caller is an active customer and write the audit log. No PII in logs.

const NOT_CUSTOMER = "Sign in with your customer account to manage your account.";

export async function getMyDeletionStateAction(): Promise<ActionResult<MyDeletionState>> {
  try {
    const me = await activeCustomer();
    if (!me) return fail(NOT_CUSTOMER);
    return ok(await getMyDeletionState(me.supabase, me.customerId));
  } catch (error) {
    console.error("getMyDeletionState failed:", (error as { message?: string })?.message ?? "unknown error");
    return fail("We couldn't load your account settings. Please refresh to try again.");
  }
}

const requestSchema = z.object({
  reason: z.string().trim().max(500, "Keep the reason under 500 characters."),
});

export async function requestAccountDeletionAction(input: z.infer<typeof requestSchema>): Promise<ActionResult<MyDeletionState>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the reason.");

  try {
    const me = await activeCustomer();
    if (!me) return fail(NOT_CUSTOMER);
    await requestAccountDeletion(me.supabase, { reason: parsed.data.reason || null });
    return ok(await getMyDeletionState(me.supabase, me.customerId));
  } catch (error) {
    console.error("requestAccountDeletion failed:", (error as { message?: string })?.message ?? "unknown error");
    return fail("We couldn't send your request. Please try again.");
  }
}

export async function withdrawAccountDeletionAction(): Promise<ActionResult<MyDeletionState>> {
  try {
    const me = await activeCustomer();
    if (!me) return fail(NOT_CUSTOMER);
    await withdrawAccountDeletion(me.supabase);
    return ok(await getMyDeletionState(me.supabase, me.customerId));
  } catch (error) {
    console.error("withdrawAccountDeletion failed:", (error as { message?: string })?.message ?? "unknown error");
    return fail("We couldn't withdraw your request. Please try again.");
  }
}
