import type { AnySupabaseClient } from "./types";

export interface CreateProvisionalCustomerParams {
  email: string;
  // Optional contact number (E.164, e.g. +923001234567).
  phone?: string;
  fullName?: string;
  // agents.id — the agent_customers.agent_id value.
  agentId: string;
  // profiles.id (auth.uid()) — stored as provisional_created_by_id.
  agentProfileId: string;
  // Where the invite email's link lands (the app's /accept-invite page).
  redirectTo: string;
  source?: string;
}

export interface CreateProvisionalCustomerResult {
  customerId: string;
}

// FR-AUTH-10 / FR-AGT-04: an agent creates an account for a customer they're
// helping. The customer gets an invite email; accepting it sets their own
// password, and from then on they sign in with email + password and see the
// orders the agent placed for them (handle_email_confirmed clears
// is_provisional at that point). Runs on a service-role (admin) client — the
// Admin API is required, and there is no RLS policy letting an agent write
// agent_customers directly, by design. If any later step fails, the
// half-created auth user is rolled back (same defensive pattern as
// modules/users/inviteUser.ts).
export async function createProvisionalCustomer(
  adminClient: AnySupabaseClient,
  params: CreateProvisionalCustomerParams,
): Promise<CreateProvisionalCustomerResult> {
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(params.email, {
    data: params.fullName ? { full_name: params.fullName } : undefined,
    redirectTo: params.redirectTo,
  });
  if (error || !data.user) {
    throw error ?? new Error("Could not create the provisional customer.");
  }

  const customerId = data.user.id;
  const rollback = () => adminClient.auth.admin.deleteUser(customerId).catch(() => {});

  if (params.phone) {
    const { error: phoneError } = await adminClient.auth.admin.updateUserById(customerId, { phone: params.phone });
    if (phoneError) {
      await rollback();
      throw phoneError;
    }
  }

  // handle_new_user runs before Supabase attaches app_metadata to the new
  // auth user (verified on the dev project), so the provisional flags are set
  // on the profile explicitly — same approach as inviteUser's role update.
  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ is_provisional: true, provisional_created_by_id: params.agentProfileId })
    .eq("id", customerId);
  if (profileError) {
    await rollback();
    throw profileError;
  }

  const { error: assignError } = await adminClient
    .from("agent_customers")
    .insert({ agent_id: params.agentId, customer_id: customerId, source: params.source ?? "agent_created" });
  if (assignError) {
    await rollback();
    throw assignError;
  }

  return { customerId };
}
