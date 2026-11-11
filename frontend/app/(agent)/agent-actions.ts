"use server";

import { z } from "zod";
import { createProvisionalCustomer } from "@multife/backend/modules/agents/createProvisionalCustomer";
import { getCurrentAgent } from "@multife/backend/modules/agents/getCurrentAgent";
import { listMyCustomers } from "@multife/backend/modules/agents/listMyCustomers";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { describeError } from "@/lib/describe-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Composes already-tested backend modules (agents + users) — no business
// logic of its own, same convention as (order)/order-actions.ts.

const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "Phone must be in international format, e.g. +923001234567.");

const createProvisionalCustomerSchema = z.object({
  phone: phoneSchema,
  fullName: z.string().min(1).optional(),
});

export async function createProvisionalCustomerAction(
  input: z.infer<typeof createProvisionalCustomerSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof createProvisionalCustomer>>>> {
  const parsed = createProvisionalCustomerSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();

    const actor = await getCurrentProfile(supabase);
    if (!actor || actor.role !== "agent" || actor.status !== "active") {
      return fail("Sign in as an agent to add a customer.");
    }

    const agent = await getCurrentAgent(supabase);
    if (!agent || agent.status !== "active") {
      return fail("Your agent account isn't active.");
    }

    const adminClient = createAdminClient();
    return ok(
      await createProvisionalCustomer(adminClient, {
        phone: parsed.data.phone,
        fullName: parsed.data.fullName,
        agentId: agent.id,
        agentProfileId: actor.id,
      }),
    );
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function listMyCustomersAction(): Promise<ActionResult<Awaited<ReturnType<typeof listMyCustomers>>>> {
  try {
    const supabase = await createClient();

    const actor = await getCurrentProfile(supabase);
    if (!actor || actor.role !== "agent" || actor.status !== "active") {
      return fail("Sign in as an agent to view your customers.");
    }

    const agent = await getCurrentAgent(supabase);
    if (!agent) return fail("Your agent account isn't set up correctly.");

    return ok(await listMyCustomers(supabase, agent.id));
  } catch (error) {
    return fail(describeError(error));
  }
}
