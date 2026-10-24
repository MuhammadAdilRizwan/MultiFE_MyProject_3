import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { AuthCard, AuthLink } from "@/components/auth/auth-card";
import { homeForRole } from "@/lib/auth-routing";
import { createClient } from "@/lib/supabase/server";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  const profile = await getCurrentProfile(await createClient());
  if (profile?.status === "active") redirect(homeForRole(profile.role));

  return (
    <AuthCard
      title="Create your account"
      subtitle="It takes a minute. You'll use it to track your orders and save your measurements."
      footer={
        <>
          Already have an account? <AuthLink href="/sign-in">Sign in</AuthLink>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
