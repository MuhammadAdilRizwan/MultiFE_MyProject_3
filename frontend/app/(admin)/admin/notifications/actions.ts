"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { retryNotification } from "@multife/backend/modules/notifications/dispatchNotifications";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { activeAdmin } from "@/lib/active-admin";
import { describeError } from "@/lib/describe-error";
import { isEmailConfigured, sendQueuedEmails } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";

// FR-NOT-03: the admin's view of the email queue.

const NOT_ADMIN = "Sign in as an active admin to manage notifications.";

export async function sendNowAction(): Promise<ActionResult<{ sent: number; failed: number }>> {
  try {
    if (!(await activeAdmin())) return fail(NOT_ADMIN);
    if (!isEmailConfigured()) return fail("Email isn't set up yet: add RESEND_API_KEY and NOTIFY_FROM_EMAIL.");
    const result = await sendQueuedEmails(50);
    revalidatePath("/admin/notifications");
    return ok({ sent: result.sent, failed: result.failed });
  } catch (error) {
    return fail(describeError(error));
  }
}

const idSchema = z.object({ id: z.string().uuid() });

export async function retryNotificationAction(input: z.infer<typeof idSchema>): Promise<ActionResult<null>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");
  try {
    const admin = await activeAdmin();
    if (!admin) return fail(NOT_ADMIN);
    await retryNotification(admin.supabase, parsed.data.id);
    revalidatePath("/admin/notifications");
    return ok(null);
  } catch (error) {
    return fail(describeError(error));
  }
}

const discardSchema = z.object({ id: z.string().uuid().optional(), allQueued: z.boolean().optional() });

// Drops unsent emails — one, or every one still queued (e.g. the test orders'
// emails before switching email on). The outbox has no delete policy for the
// session, so this uses the service client, scoped to unsent rows only.
export async function discardNotificationsAction(input: z.infer<typeof discardSchema>): Promise<ActionResult<{ removed: number }>> {
  const parsed = discardSchema.safeParse(input);
  if (!parsed.success || (!parsed.data.id && !parsed.data.allQueued)) return fail("Invalid input.");
  try {
    if (!(await activeAdmin())) return fail(NOT_ADMIN);
    let query = createAdminClient().from("notification_outbox").delete({ count: "exact" }).neq("status", "sent");
    query = parsed.data.id ? query.eq("id", parsed.data.id) : query.eq("status", "pending");
    const { error, count } = await query;
    if (error) throw error;
    revalidatePath("/admin/notifications");
    return ok({ removed: count ?? 0 });
  } catch (error) {
    return fail(describeError(error));
  }
}
