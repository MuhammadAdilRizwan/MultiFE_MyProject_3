import type { Metadata } from "next";
import { AuthCard, AuthLink } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/alert";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter the email you signed up with and we'll send you a link to set a new one."
      footer={
        <>
          Remembered it? <AuthLink href="/sign-in">Back to sign in</AuthLink>
        </>
      }
    >
      {error === "link_expired" && (
        <div className="mb-6">
          <Alert tone="warning">
            That reset link has expired or was already used. Request a new one below — links
            only work on the device where you asked for them.
          </Alert>
        </div>
      )}
      <ForgotPasswordForm />
    </AuthCard>
  );
}
