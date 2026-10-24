"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { TextField } from "@/components/ui/text-field";
import { CheckEmail } from "@/components/auth/check-email";
import { signUpAction } from "../actions";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = Partial<Record<"fullName" | "email" | "password" | "confirm", string>>;

export function SignUpForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function validate(): Errors {
    const next: Errors = {};
    if (!fullName.trim()) next.fullName = "Enter your full name.";
    if (!EMAIL_PATTERN.test(email.trim())) next.email = "Enter a valid email address.";
    if (password.length < 8) next.password = "Use at least 8 characters.";
    if (confirm !== password) next.confirm = "Passwords don't match.";
    return next;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    startTransition(async () => {
      const result = await signUpAction({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      if (result.data.confirmed) {
        router.replace("/");
        router.refresh();
      } else {
        setSentTo(email.trim());
      }
    });
  }

  if (sentTo) {
    return (
      <CheckEmail email={sentTo}>
        We&apos;ve sent a confirmation link. Open it on this device to activate your account.
      </CheckEmail>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert tone="danger">{formError}</Alert>}

      <TextField
        id="fullName"
        label="Full name"
        autoComplete="name"
        required
        value={fullName}
        error={errors.fullName}
        onChange={(e) => setFullName(e.target.value)}
      />
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        required
        value={email}
        error={errors.email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <PasswordField
        id="password"
        label="Password"
        autoComplete="new-password"
        required
        value={password}
        error={errors.password}
        hint="At least 8 characters."
        onChange={(e) => setPassword(e.target.value)}
      />
      <PasswordField
        id="confirm"
        label="Confirm password"
        autoComplete="new-password"
        required
        value={confirm}
        error={errors.confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />

      <Button type="submit" className="w-full" pending={pending} pendingLabel="Creating account…">
        Create account
      </Button>
    </form>
  );
}
