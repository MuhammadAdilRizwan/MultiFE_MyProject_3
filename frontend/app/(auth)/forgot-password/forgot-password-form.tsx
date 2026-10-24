"use client";

import { useState, useTransition, type FormEvent } from "react";
import { CheckEmail } from "@/components/auth/check-email";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { requestPasswordResetAction } from "../actions";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError(undefined);

    startTransition(async () => {
      const result = await requestPasswordResetAction({ email: value });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setSentTo(value);
    });
  }

  if (sentTo) {
    return (
      <CheckEmail email={sentTo}>
        If an account exists for this email, a password reset link is on its way. Open it on this
        device — it expires after a short time.
      </CheckEmail>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        required
        value={email}
        error={fieldError}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" className="w-full" pending={pending} pendingLabel="Sending link…">
        Send reset link
      </Button>
    </form>
  );
}
