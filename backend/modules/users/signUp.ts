import type { AnySupabaseClient } from "./types";

export interface SignUpCustomerParams {
  email: string;
  password: string;
  fullName: string;
  emailRedirectTo?: string;
}

export interface SignUpCustomerResult {
  userId: string | null;
  // true once Supabase has actually issued a session (depends on the
  // project's "confirm email" setting); false means a confirmation email
  // was sent and the account isn't usable yet.
  session: boolean;
}

// Customer self sign-up. No app_metadata is set, so the `handle_new_user`
// trigger defaults the new profile's role to 'customer'.
export async function signUpCustomer(
  supabase: AnySupabaseClient,
  { email, password, fullName, emailRedirectTo }: SignUpCustomerParams,
): Promise<SignUpCustomerResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo,
    },
  });

  if (error) throw error;

  return {
    userId: data.user?.id ?? null,
    session: data.session !== null,
  };
}
