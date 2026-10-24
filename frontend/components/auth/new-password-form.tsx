"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { updatePasswordAction } from "@/app/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";

type Errors = Partial<Record<"password" | "confirm", string>>;

export function NewPasswordForm({
  redirectTo,
  submitLabel,
}: {
  redirectTo: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const found: Errors = {};
    if (password.length < 8) found.password = "Use at least 8 characters.";
    if (confirm !== password) found.confirm = "Passwords don't match.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    startTransition(async () => {
      const result = await updatePasswordAction({ password });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setDone(true);
      router.replace(redirectTo);
      router.refresh();
    });
  }

  if (done) {
    return <Alert tone="success">Password saved. Taking you in…</Alert>;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <PasswordField
        id="password"
        label="New password"
        autoComplete="new-password"
        required
        value={password}
        error={errors.password}
        hint="At least 8 characters."
        onChange={(e) => setPassword(e.target.value)}
      />
      <PasswordField
        id="confirm"
        label="Confirm new password"
        autoComplete="new-password"
        required
        value={confirm}
        error={errors.confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <Button type="submit" className="w-full" pending={pending} pendingLabel="Saving…">
        {submitLabel}
      </Button>
    </form>
  );
}
