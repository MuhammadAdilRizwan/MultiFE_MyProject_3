import { AuthError } from "./errors";
import type { AnySupabaseClient, InviteParams } from "./types";

export interface InviteUserResult {
  userId: string;
}

// `adminClient.auth.admin.inviteUserByEmail` only accepts `data`
// (-> user_metadata), not app_metadata. The DB trigger `handle_new_user`
// reads app_metadata at insert time to seed `profiles.role` and the role's
// linking row (agents / supplier_contacts), so by the time this invite call
// returns, the trigger has already run with no app_metadata and created a
// default 'customer' profile with no linking row. This function fixes that
// up immediately afterwards, using the same service-role client (RLS-
// bypassing, which is what the trigger's own comment says the server is
// expected to do), and also patches app_metadata so it reflects the real
// role for anyone who reads it later (including custom_access_token_hook on
// the next token refresh). If the fix-up fails, the half-invited auth user
// is deleted so we never leave a stray, wrongly-privileged account behind.
export async function inviteUser(
  adminClient: AnySupabaseClient,
  params: InviteParams,
  redirectTo: string,
): Promise<InviteUserResult> {
  const { email, fullName } = params;

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    { data: fullName ? { full_name: fullName } : undefined, redirectTo },
  );

  if (inviteError || !invited.user) {
    if (inviteError?.message?.toLowerCase().includes("already")) {
      throw new AuthError("already_exists", `${email} is already registered.`);
    }
    throw new AuthError("invite_failed", inviteError?.message ?? "Could not send the invite.");
  }

  const userId = invited.user.id;

  try {
    await applyRole(adminClient, userId, params);

    const { error: metaError } = await adminClient.auth.admin.updateUserById(userId, {
      app_metadata: appMetadataFor(params),
    });
    if (metaError) throw metaError;
  } catch (err) {
    await adminClient.auth.admin.deleteUser(userId);
    throw new AuthError("invite_failed", messageOf(err));
  }

  return { userId };
}

async function applyRole(
  adminClient: AnySupabaseClient,
  userId: string,
  params: InviteParams,
): Promise<void> {
  const { error: roleError } = await adminClient
    .from("profiles")
    .update({ role: params.role })
    .eq("id", userId);
  if (roleError) throw roleError;

  if (params.role === "agent") {
    const { error } = await adminClient.from("agents").insert({
      profile_id: userId,
      code: params.agentCode ?? `AG-${userId.slice(0, 8)}`,
      region: params.region ?? null,
    });
    if (error) throw error;
  } else if (params.role === "supplier_contact") {
    const { error } = await adminClient.from("supplier_contacts").insert({
      supplier_id: params.supplierId,
      user_id: userId,
    });
    if (error) throw error;
  }
}

function appMetadataFor(params: InviteParams): Record<string, unknown> {
  if (params.role === "supplier_contact") {
    return { role: params.role, supplier_id: params.supplierId };
  }
  return { role: params.role };
}

// Supabase's Postgrest/Auth errors are plain objects with a `message` field,
// not `Error` instances, so `err instanceof Error` misses them and hides the
// real cause. Fall back to the generic text only when there's truly nothing.
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Could not finish setting up the invite.";
}

export function inviteAdmin(
  adminClient: AnySupabaseClient,
  params: { email: string; fullName?: string },
  redirectTo: string,
) {
  return inviteUser(adminClient, { role: "admin", ...params }, redirectTo);
}

export function inviteAgent(
  adminClient: AnySupabaseClient,
  params: { email: string; fullName?: string; agentCode?: string; region?: string },
  redirectTo: string,
) {
  return inviteUser(adminClient, { role: "agent", ...params }, redirectTo);
}

export function inviteProductionStaff(
  adminClient: AnySupabaseClient,
  role: "tailor" | "qc" | "dispatch",
  params: { email: string; fullName?: string },
  redirectTo: string,
) {
  return inviteUser(adminClient, { role, ...params }, redirectTo);
}

export function inviteSupplierContact(
  adminClient: AnySupabaseClient,
  params: { email: string; fullName?: string; supplierId: string },
  redirectTo: string,
) {
  return inviteUser(adminClient, { role: "supplier_contact", ...params }, redirectTo);
}
