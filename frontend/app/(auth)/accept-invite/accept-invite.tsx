"use client";

import { useEffect, useRef, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import type { AppRole } from "@multife/backend/modules/users/types";
import { AuthCard } from "@/components/auth/auth-card";
import { LinkExpired } from "@/components/auth/link-expired";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { homeForRole } from "@/lib/auth-routing";
import { createClient } from "@/lib/supabase/client";

const ROLE_LABELS: Record<AppRole, string> = {
  customer: "Customer",
  agent: "Field agent",
  tailor: "Tailor",
  qc: "Quality control",
  dispatch: "Dispatch",
  supplier_contact: "Supplier contact",
  admin: "Admin",
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; email: string | null; role: AppRole }
  | { kind: "expired"; message: string };

export function AcceptInvite() {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Invite tokens are single-use; React's dev double-effect must not spend it twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function establishSession() {
      const supabase = createClient();
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const query = new URLSearchParams(window.location.search);

      const linkError = hash.get("error_description") ?? query.get("error_description");
      if (linkError) {
        setState({ kind: "expired", message: friendlyLinkError(linkError) });
        return;
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const tokenHash = query.get("token_hash");
      const type = query.get("type") as EmailOtpType | null;

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setState({ kind: "expired", message: friendlyLinkError(error.message) });
          return;
        }
      } else if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) {
          setState({ kind: "expired", message: friendlyLinkError(error.message) });
          return;
        }
      }

      // Don't leave tokens sitting in the address bar or browser history.
      window.history.replaceState(null, "", window.location.pathname);

      const profile = await getCurrentProfile(supabase).catch(() => null);
      if (!profile) {
        setState({
          kind: "expired",
          message: "This invite link has expired or was already used. Ask your MultiFe admin to send a new invite.",
        });
        return;
      }
      setState({ kind: "ready", email: profile.email, role: profile.role });
    }

    void establishSession();
  }, []);

  if (state.kind === "loading") {
    return (
      <AuthCard title="Accepting your invite">
        <div className="flex items-center gap-3 text-sm text-muted" role="status">
          <svg className="h-5 w-5 animate-spin text-cyan-bright" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Checking your invite link…
        </div>
      </AuthCard>
    );
  }

  if (state.kind === "expired") {
    return (
      <AuthCard title="Invite link not valid">
        <LinkExpired message={state.message} actionHref="/sign-in" actionLabel="Go to sign in" />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Welcome to MultiFe"
      subtitle={
        <>
          You&apos;ve been invited as{" "}
          <span className="font-medium text-ink">{ROLE_LABELS[state.role]}</span>
          {state.email && (
            <>
              {" "}
              (<span className="font-medium text-ink">{state.email}</span>)
            </>
          )}
          . Choose a password to finish setting up your account.
        </>
      }
    >
      <NewPasswordForm redirectTo={homeForRole(state.role)} submitLabel="Set password & continue" />
    </AuthCard>
  );
}

function friendlyLinkError(raw: string): string {
  const text = raw.replace(/\+/g, " ").toLowerCase();
  if (text.includes("expired") || text.includes("invalid")) {
    return "This invite link has expired or was already used. Ask your MultiFe admin to send a new invite.";
  }
  return "We couldn't open this invite link. Ask your MultiFe admin to send a new invite.";
}
