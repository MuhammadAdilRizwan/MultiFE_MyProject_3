import type { Metadata } from "next";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { AuthCard } from "@/components/auth/auth-card";
import { LinkExpired } from "@/components/auth/link-expired";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { Alert } from "@/components/ui/alert";
import { homeForRole } from "@/lib/auth-routing";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set a new password" };

// Reached from the reset email via /auth/callback, which has already exchanged
// the link's code for a session. No session means the link didn't work.
export default async function ResetPasswordPage() {
  const profile = await getCurrentProfile(await createClient());

  if (!profile) {
    return (
      <AuthCard title="Link expired">
        <LinkExpired
          message="This password reset link has expired or was already used. Request a new one and open it on this device."
          actionHref="/forgot-password"
          actionLabel="Request a new link"
        />
      </AuthCard>
    );
  }

  if (profile.status === "suspended") {
    return (
      <AuthCard title="Account suspended">
        <Alert tone="danger">
          This account has been suspended, so its password can&apos;t be changed. Contact MultiFe
          support if you think this is a mistake.
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set a new password"
      subtitle={
        <>
          For <span className="font-medium text-navy">{profile.email}</span>. You&apos;ll be
          signed in once it&apos;s saved.
        </>
      }
    >
      <NewPasswordForm redirectTo={homeForRole(profile.role)} submitLabel="Save new password" />
    </AuthCard>
  );
}
