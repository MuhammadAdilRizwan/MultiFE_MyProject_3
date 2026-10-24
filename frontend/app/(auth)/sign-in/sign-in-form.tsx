"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { TextField } from "@/components/ui/text-field";
import { homeForRole } from "@/lib/auth-routing";
import { signInAction } from "../actions";

export function SignInForm({ nextPath }: { nextPath: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await signInAction({ email: email.trim(), password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(nextPath ?? homeForRole(result.data.role));
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <div>
        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="mt-2 text-right">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-ocean underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>

      <Button
        type="submit"
        className="w-full"
        pending={pending}
        pendingLabel="Signing in…"
        disabled={!email || !password}
      >
        Sign in
      </Button>
    </form>
  );
}
