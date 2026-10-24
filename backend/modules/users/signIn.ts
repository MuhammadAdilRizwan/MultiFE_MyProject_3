import { AuthError } from "./errors";
import type { AnySupabaseClient, ProfileRow } from "./types";

export interface SignInParams {
  email: string;
  password: string;
}

export interface SignInResult {
  userId: string;
  profile: ProfileRow;
}

// FR-AUTH-06: suspended accounts can't sign in. `custom_access_token_hook`
// isn't enabled yet, so the check reads `profiles.status` directly rather
// than trusting a JWT claim.
export async function signInWithPassword(
  supabase: AnySupabaseClient,
  { email, password }: SignInParams,
): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    throw new AuthError("invalid_credentials", "Incorrect email or password.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, full_name, phone, email, status")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    throw new AuthError("invalid_credentials", "Incorrect email or password.");
  }

  if ((profile as ProfileRow).status === "suspended") {
    await supabase.auth.signOut();
    throw new AuthError("account_suspended", "This account has been suspended.");
  }

  return { userId: data.user.id, profile: profile as ProfileRow };
}
