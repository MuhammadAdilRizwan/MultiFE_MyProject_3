import type { AnySupabaseClient } from "./types";

export interface UpdatePasswordParams {
  password: string;
}

// Requires an active session — the one established by following a
// password-reset or invite-accept link through /auth/callback.
export async function updatePassword(
  supabase: AnySupabaseClient,
  { password }: UpdatePasswordParams,
): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
