"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { completeAccountDeletion, declineAccountDeletion } from "@multife/backend/modules/users/accountDeletion";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { activeAdmin } from "@/lib/active-admin";

// FR-AUTH-09: an admin deletes a customer's account at their request, or
// declines with a note the customer sees. The database functions re-check
// admin, the open request and open orders, and write the audit log.

// Messages from the functions that are safe to show as they are.
const SAFE = [
  /^This request is no longer open$/,
  /^You cannot delete your own account$/,
  /^Only customer accounts can be deleted here$/,
  /^Wait until their \d+ open order\(s\) are delivered or cancelled$/,
  /^Tell the customer why$/,
];

const messageOf = (error: unknown) => (error as { message?: string })?.message ?? "";

const completeSchema = z.object({ requestId: z.string().uuid() });

export async function completeAccountDeletionAction(input: z.infer<typeof completeSchema>): Promise<ActionResult<{ ordersKept: number }>> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");

  try {
    const admin = await activeAdmin();
    if (!admin) return fail("Sign in as an active admin to manage users.");
    const result = await completeAccountDeletion(admin.supabase, { requestId: parsed.data.requestId });
    revalidatePath("/admin/users/deletions");
    revalidatePath("/admin/users");
    return ok(result);
  } catch (error) {
    const message = messageOf(error);
    if (SAFE.some((re) => re.test(message))) return fail(`${message}.`);
    console.error("completeAccountDeletion failed:", message || "unknown error");
    return fail("We couldn't delete this account. Nothing was changed. Please try again.");
  }
}

const declineSchema = z.object({
  requestId: z.string().uuid(),
  note: z.string().trim().min(3, "Tell the customer why.").max(300, "Keep the note under 300 characters."),
});

export async function declineAccountDeletionAction(input: z.infer<typeof declineSchema>): Promise<ActionResult<null>> {
  const parsed = declineSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const admin = await activeAdmin();
    if (!admin) return fail("Sign in as an active admin to manage users.");
    await declineAccountDeletion(admin.supabase, parsed.data);
    revalidatePath("/admin/users/deletions");
    revalidatePath("/admin/users");
    return ok(null);
  } catch (error) {
    const message = messageOf(error);
    if (SAFE.some((re) => re.test(message))) return fail(`${message}.`);
    console.error("declineAccountDeletion failed:", message || "unknown error");
    return fail("We couldn't decline this request. Please try again.");
  }
}
