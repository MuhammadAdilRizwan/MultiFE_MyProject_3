import "server-only";
import { after } from "next/server";
import { dispatchNotifications, emailConfigFromEnv, type DispatchResult } from "@multife/backend/modules/notifications/dispatchNotifications";
import { createAdminClient } from "@/lib/supabase/admin";

// Sending queued emails (FR-NOT-02). Order events only queue a row in the
// database; this sends it through Resend after the response has gone out,
// so the customer never waits on the email provider. Anything that fails
// stays queued and is retried by the next run (here, the scheduled route
// /api/cron/notifications, or the admin's "Send now").
// Needs RESEND_API_KEY + NOTIFY_FROM_EMAIL; without them nothing is sent.

export const isEmailConfigured = () => emailConfigFromEnv(process.env) !== null;

export async function sendQueuedEmails(limit = 20): Promise<DispatchResult> {
  return dispatchNotifications(createAdminClient(), emailConfigFromEnv(process.env), limit);
}

// Call from a Server Action after something that queues an email.
export function kickNotifications() {
  if (!isEmailConfigured()) return;
  after(async () => {
    try {
      await sendQueuedEmails();
    } catch (error) {
      // No recipient or payload here — only the error's kind.
      console.error("sending queued emails failed:", error instanceof Error ? error.name : "unknown error");
    }
  });
}
