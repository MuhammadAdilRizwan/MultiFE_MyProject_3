"use client";

import { useState, useTransition } from "react";
import { discardNotificationsAction, retryNotificationAction, sendNowAction } from "@/app/(admin)/admin/notifications/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// "Send now" and "Discard all queued" for the email queue (FR-NOT-03).
export function NotificationControls({ configured, queued }: { configured: boolean; queued: number }) {
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  function sendNow() {
    setMessage(null);
    start(async () => {
      const result = await sendNowAction();
      setMessage(
        result.ok
          ? { tone: "success", text: `Sent ${result.data.sent}${result.data.failed ? `, ${result.data.failed} will be retried` : ""}.` }
          : { tone: "danger", text: result.error },
      );
    });
  }

  function discardAll() {
    setMessage(null);
    start(async () => {
      const result = await discardNotificationsAction({ allQueued: true });
      setConfirming(false);
      setMessage(result.ok ? { tone: "success", text: `Discarded ${result.data.removed} queued emails.` } : { tone: "danger", text: result.error });
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={sendNow} pending={pending} pendingLabel="Sending…" disabled={!configured || queued === 0} className="h-10 px-5 text-sm">
          Send queued emails now
        </Button>
        {queued > 0 &&
          (confirming ? (
            <>
              <Button type="button" variant="secondary" onClick={discardAll} pending={pending} pendingLabel="Discarding…" className="h-10 px-5 text-sm text-danger">
                Yes, discard {queued}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending} className="h-10 px-5 text-sm">
                Keep them
              </Button>
            </>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setConfirming(true)} disabled={pending} className="h-10 px-5 text-sm">
              Discard all queued
            </Button>
          ))}
      </div>
      {confirming && <p className="mt-2 text-xs text-danger">Queued emails that are discarded are never sent. This can&apos;t be undone.</p>}
      {message && (
        <div className="mt-3">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
    </div>
  );
}

export function NotificationRowActions({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  };
  return (
    <div className="flex flex-none items-center gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => retryNotificationAction({ id }))}
        className="h-9 rounded-full border border-white/30 bg-mf-blue px-4 text-xs font-bold text-white shadow-blue disabled:opacity-60"
      >
        Retry
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => discardNotificationsAction({ id }))}
        className="h-9 rounded-full border border-line bg-white px-4 text-xs font-bold text-ink hover:text-danger disabled:opacity-60"
      >
        Discard
      </button>
    </div>
  );
}
