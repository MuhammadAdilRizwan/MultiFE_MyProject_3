"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { setAccountStatusAction } from "./actions";

// Suspend (with a reason) or reactivate one account, from the users list.
export function StatusControl({ userId, name, status, isSelf }: { userId: string; name: string; status: "active" | "suspended"; isSelf: boolean }) {
  const [current, setCurrent] = useState(status);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (isSelf) return <span className="text-xs text-hint">This is you</span>;

  function run(next: "active" | "suspended") {
    setError(null);
    startTransition(async () => {
      const result =
        next === "suspended"
          ? await setAccountStatusAction({ userId, status: "suspended", reason })
          : await setAccountStatusAction({ userId, status: "active" });
      if (!result.ok) return setError(result.error);
      setCurrent(result.data.status);
      setAsking(false);
      setReason("");
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) return setError("Give a short reason for suspending.");
    run("suspended");
  }

  const small = "inline-flex h-9 items-center rounded-full border px-3 text-sm font-semibold transition-colors disabled:opacity-60";

  if (current === "suspended") {
    return (
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <button type="button" disabled={pending} onClick={() => run("active")} className={`${small} border-line bg-white text-ink hover:border-cyan-bright/60 hover:text-ocean`}>
          {pending ? "Reactivating…" : "Reactivate"}
        </button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={`${small} border-danger/30 text-danger hover:bg-danger-soft`}>
        Suspend
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full rounded-2xl border border-danger/25 bg-danger-soft/40 p-3 sm:w-72">
      <label htmlFor={`reason-${userId}`} className="text-sm font-semibold text-ink">
        Suspend {name}?
      </label>
      <p className="mt-0.5 text-xs text-muted">They&apos;re signed out and can&apos;t sign in or order until reactivated.</p>
      <input
        id={`reason-${userId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
        placeholder="Reason (kept in the audit log)"
        className="mt-2 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-cyan-bright focus:outline-none focus:ring-4 focus:ring-cyan-bright/20"
      />
      {error && (
        <div className="mt-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => (setAsking(false), setError(null))} disabled={pending} className={`${small} border-line bg-white text-ink`}>
          Keep active
        </button>
        <button type="submit" disabled={pending} className={`${small} border-transparent bg-danger text-white`}>
          {pending ? "Suspending…" : "Suspend"}
        </button>
      </div>
    </form>
  );
}
