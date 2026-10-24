import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { AuthCard, AuthLink } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/alert";
import { homeForRole, safeNextPath } from "@/lib/auth-routing";
import { createClient } from "@/lib/supabase/server";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const nextPath = safeNextPath(next);

  const profile = await getCurrentProfile(await createClient());
  if (profile?.status === "active") {
    redirect(nextPath ?? homeForRole(profile.role));
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to continue your order or manage your account."
      footer={
        <>
          New to MultiFe? <AuthLink href="/sign-up">Create an account</AuthLink>
        </>
      }
    >
      {error === "link_expired" && (
        <div className="mb-6">
          <Alert tone="warning">
            That link has expired or was already used. Please sign in, or request a new link.
          </Alert>
        </div>
      )}
      <SignInForm nextPath={nextPath} />
    </AuthCard>
  );
}
