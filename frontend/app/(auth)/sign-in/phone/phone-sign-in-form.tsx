"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { formatPhone, toInternationalPhone } from "@/lib/phone";
import { phoneOtpMessage } from "@/lib/phone-otp";
import { createClient } from "@/lib/supabase/client";

// Two steps: send a one-time code to the number, then verify it. Only
// existing accounts can sign in here (shouldCreateUser: false) — customers
// sign up with email, and phone-only accounts are created by agents.
export function PhoneSignInForm({ nextPath }: { nextPath: string | null }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function sendCode(to: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const { error: sendError } = await createClient().auth.signInWithOtp({
        phone: to,
        options: { shouldCreateUser: false },
      });
      if (sendError) {
        setError(phoneOtpMessage(sendError.message, "send"));
        return;
      }
      setSentTo(to);
      setCode("");
      setNotice(`We've sent a 6-digit code to ${formatPhone(to)}.`);
    });
  }

  function onSendSubmit(event: FormEvent) {
    event.preventDefault();
    const international = toInternationalPhone(phone);
    if (!international) {
      setError("Enter a valid mobile number, e.g. 0300 1234567.");
      return;
    }
    sendCode(international);
  }

  function onVerifySubmit(event: FormEvent) {
    event.preventDefault();
    if (!sentTo) return;
    const token = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(token)) {
      setError("Enter the 6-digit code from the text message.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const { error: verifyError } = await createClient().auth.verifyOtp({ phone: sentTo, token, type: "sms" });
      if (verifyError) {
        setError(phoneOtpMessage(verifyError.message, "verify"));
        return;
      }
      router.replace(nextPath ?? "/account/orders");
      router.refresh();
    });
  }

  if (!sentTo) {
    return (
      <form onSubmit={onSendSubmit} noValidate className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}
        <TextField
          id="phone"
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0300 1234567"
          maxLength={20}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Button type="submit" pending={pending} pendingLabel="Sending code…" className="w-full">
          Text me a code
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onVerifySubmit} noValidate className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : notice && <Alert tone="info">{notice}</Alert>}
      <TextField
        id="code"
        label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      />
      <Button type="submit" pending={pending} pendingLabel="Checking…" className="w-full">
        Sign in
      </Button>
      <div className="flex justify-between text-sm">
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setError(null);
            setNotice(null);
          }}
          className="font-semibold text-ocean hover:underline"
        >
          Use a different number
        </button>
        <button type="button" onClick={() => sendCode(sentTo)} disabled={pending} className="font-semibold text-ocean hover:underline disabled:opacity-60">
          Send a new code
        </button>
      </div>
    </form>
  );
}
