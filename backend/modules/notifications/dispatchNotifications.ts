import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, type NotificationPayload } from "./templates";

// FR-NOT-02/03: drains notification_outbox (email) through Resend, so a slow
// or failing provider never blocks an order. Must run with the SERVICE ROLE
// client (fn_claim_notifications / fn_finish_notification are service-only).
// Claimed rows are leased for 10 minutes; failures back off exponentially
// and become 'failed' after 5 attempts, which the admin sees and can retry.
// Recipients and payloads are never logged.

export interface EmailConfig {
  apiKey: string;
  from: string;
  siteUrl: string;
  fetchImpl?: typeof fetch;
}

type OutboxRow = { id: string; recipient: string; template: string; payload: NotificationPayload };

export interface DispatchResult {
  configured: boolean;
  claimed: number;
  sent: number;
  failed: number;
}

export function emailConfigFromEnv(env: Record<string, string | undefined>): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.NOTIFY_FROM_EMAIL?.trim();
  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!apiKey || !from || !siteUrl) return null;
  return { apiKey, from, siteUrl };
}

async function sendOne(config: EmailConfig, row: OutboxRow): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = renderEmail(row.template, row.payload ?? {}, config.siteUrl);
  const doFetch = config.fetchImpl ?? fetch;
  try {
    const res = await doFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        // Resend dedupes on this, so a retry after a timeout can't send twice.
        "Idempotency-Key": `outbox-${row.id}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [row.recipient],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `Resend ${res.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.name : "Network error" };
  }
}

export async function dispatchNotifications(
  serviceClient: SupabaseClient,
  config: EmailConfig | null,
  limit = 20,
): Promise<DispatchResult> {
  if (!config) return { configured: false, claimed: 0, sent: 0, failed: 0 };

  const { data, error } = await serviceClient.rpc("fn_claim_notifications", { p_limit: limit });
  if (error) throw error;
  const rows = (data ?? []) as OutboxRow[];

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await sendOne(config, row);
    const { error: finishError } = await serviceClient.rpc("fn_finish_notification", {
      p_id: row.id,
      p_ok: result.ok,
      p_error: result.ok ? null : result.error,
    });
    if (finishError) throw finishError;
    if (result.ok) sent++;
    else failed++;
  }
  return { configured: true, claimed: rows.length, sent, failed };
}

// FR-NOT-03: the admin puts a failed email back in the queue.
export async function retryNotification(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.rpc("fn_admin_retry_notification", { p_id: id });
  if (error) throw error;
}
