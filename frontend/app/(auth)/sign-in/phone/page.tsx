import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { AuthCard, AuthLink } from "@/components/auth/auth-card";
import { homeForRole, safeNextPath } from "@/lib/auth-routing";
import { createClient } from "@/lib/supabase/server";
import { PhoneSignInForm } from "./phone-sign-in-form";

export const metadata: Metadata = { title: "Sign in with your phone" };

// FR-AUTH-10: a customer an agent added (phone only, no password) signs in
// here with a one-time SMS code. The first successful sign-in claims the
// account (handle_phone_confirmed clears is_provisional and logs the claim).
export default async function PhoneSignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const nextPath = safeNextPath((await searchParams).next);
  const profile = await getCurrentProfile(await createClient());
  if (profile?.status === "active") redirect(nextPath ?? homeForRole(profile.role));

  return (
    <AuthCard
      title="Sign in with your phone"
      subtitle="Did a MultiFe agent create your account? Enter your mobile number and we'll text you a code to sign in and claim it."
      footer={
        <>
          Have an email and password? <AuthLink href="/sign-in">Sign in with email</AuthLink>
        </>
      }
    >
      <PhoneSignInForm nextPath={nextPath} />
    </AuthCard>
  );
}
