import type { AnySupabaseClient } from "./types";

export interface RequestPasswordResetParams {
  email: string;
  redirectTo: string;
}

// Always resolves without revealing whether the email exists, matching
// Supabase Auth's own behaviour for this endpoint.
export async function requestPasswordReset(
  supabase: AnySupabaseClient,
  { email, redirectTo }: RequestPasswordResetParams,
): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}
