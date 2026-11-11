import type { AnySupabaseClient } from "./types";

export interface CreateProvisionalCustomerParams {
  phone: string;
  fullName?: string;
  // agents.id — the agent_customers.agent_id value.
  agentId: string;
  // profiles.id (auth.uid()) — stored as provisional_created_by_id.
  agentProfileId: string;
  source?: string;
}

export interface CreateProvisionalCustomerResult {
  customerId: string;
}

// FR-AUTH-10: an agent creates a customer with no credentials (phone only,
// unconfirmed) through the Admin API. handle_new_user reads app_metadata at
// insert time to seed profiles.is_provisional/provisional_created_by_id, so
// this must run on a service-role (admin) client — there is also no RLS
// policy letting an agent write agent_customers directly, by design. If the
// assignment write fails, the half-created auth user is rolled back (same
// defensive pattern as modules/users/inviteUser.ts).
export async function createProvisionalCustomer(
  adminClient: AnySupabaseClient,
  params: CreateProvisionalCustomerParams,
): Promise<CreateProvisionalCustomerResult> {
  const { data, error } = await adminClient.auth.admin.createUser({
    phone: params.phone,
    phone_confirm: false,
    user_metadata: params.fullName ? { full_name: params.fullName } : undefined,
    app_metadata: {
      role: "customer",
      provisional: true,
      provisional_created_by_id: params.agentProfileId,
    },
  });
  if (error || !data.user) {
    throw error ?? new Error("Could not create the provisional customer.");
  }

  const customerId = data.user.id;

  const { error: assignError } = await adminClient
    .from("agent_customers")
    .insert({ agent_id: params.agentId, customer_id: customerId, source: params.source ?? "agent_created" });
  if (assignError) {
    await adminClient.auth.admin.deleteUser(customerId).catch(() => {});
    throw assignError;
  }

  return { customerId };
}
