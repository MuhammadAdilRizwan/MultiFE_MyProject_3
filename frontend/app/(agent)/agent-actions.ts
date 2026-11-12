"use server";

import { z } from "zod";
import { createProvisionalCustomer } from "@multife/backend/modules/agents/createProvisionalCustomer";
import { getCurrentAgent } from "@multife/backend/modules/agents/getCurrentAgent";
import { listMyCustomers } from "@multife/backend/modules/agents/listMyCustomers";
import { getMyCustomer } from "@multife/backend/modules/agents/getMyCustomer";
import type { VisitRow, VisitWithCustomer } from "@multife/backend/modules/agents/types";
import { bookVisit, cancelVisit, listMyVisits, recordVisitMeasurements } from "@multife/backend/modules/agents/visits";
import { CORE_MEASUREMENT_KEYS, STANDARD_MEASUREMENTS } from "@multife/backend/modules/rules/standardMeasurements";
import { validateMeasurements } from "@multife/backend/modules/rules/validateMeasurements";
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
  email: z.string().trim().toLowerCase().email("Enter the customer's email address."),
  phone: phoneSchema.optional(),
  fullName: z.string().trim().min(1).max(80).optional(),
});

// The invite email's link lands on the app's accept-invite page, where the
// customer sets their password.
const inviteRedirect = () => new URL("/accept-invite", process.env.NEXT_PUBLIC_SITE_URL).toString();

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
        email: parsed.data.email,
        phone: parsed.data.phone,
        fullName: parsed.data.fullName,
        agentId: agent.id,
        agentProfileId: actor.id,
        redirectTo: inviteRedirect(),
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

// ---------------------------------------------------------------------------
// Measurement visits (FR-AGT-12). Writes go through the agents/visits module
// (SECURITY DEFINER functions: assignment check + audit); the checks here are
// input validation and "is this an active agent".
// ---------------------------------------------------------------------------

async function activeAgentSession() {
  const supabase = await createClient();
  const actor = await getCurrentProfile(supabase);
  if (!actor || actor.role !== "agent" || actor.status !== "active") return null;
  const agent = await getCurrentAgent(supabase);
  if (!agent || agent.status !== "active") return null;
  return { supabase, actor, agent };
}

const NOT_AGENT = "Sign in as an active agent to manage visits.";

// Database messages that are safe to show the agent as-is.
const VISIT_MESSAGES = ["Choose a date and time in the future", "This visit is already closed"];
function visitError(error: unknown): string {
  const message = describeError(error);
  return VISIT_MESSAGES.includes(message) ? message : "Something went wrong. Please try again.";
}

export async function listMyVisitsAction(): Promise<ActionResult<VisitWithCustomer[]>> {
  try {
    const session = await activeAgentSession();
    if (!session) return fail(NOT_AGENT);
    return ok(await listMyVisits(session.supabase, session.actor.id));
  } catch (error) {
    return fail(visitError(error));
  }
}

const bookVisitSchema = z.object({
  customerId: z.string().uuid("Choose a customer."),
  scheduledFor: z.string().datetime({ offset: true, message: "Choose a date and time." }),
  address: z.string().trim().min(5, "Enter the visit address.").max(300),
  notes: z.string().trim().max(500).optional(),
});

export async function bookVisitAction(input: z.infer<typeof bookVisitSchema>): Promise<ActionResult<VisitRow>> {
  const parsed = bookVisitSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  if (new Date(parsed.data.scheduledFor).getTime() < Date.now()) return fail("Choose a date and time in the future");

  try {
    const session = await activeAgentSession();
    if (!session) return fail(NOT_AGENT);
    if (!(await getMyCustomer(session.supabase, session.agent.id, parsed.data.customerId))) {
      return fail("This customer isn't assigned to you.");
    }
    return ok(
      await bookVisit(session.supabase, {
        customerId: parsed.data.customerId,
        scheduledFor: parsed.data.scheduledFor,
        address: parsed.data.address,
        notes: parsed.data.notes || undefined,
      }),
    );
  } catch (error) {
    return fail(visitError(error));
  }
}

const recordVisitSchema = z.object({
  visitId: z.string().uuid(),
  values: z.record(z.string().max(40), z.union([z.number(), z.string().max(12)])),
});

// The core measurements are required; any others the agent took are
// validated too. Empty optional fields are left out.
export async function recordVisitMeasurementsAction(
  input: z.infer<typeof recordVisitSchema>,
): Promise<ActionResult<VisitRow>> {
  const parsed = recordVisitSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");

  const filled = (key: string) => {
    const v = parsed.data.values[key];
    return v !== undefined && String(v).trim() !== "";
  };
  const fields = STANDARD_MEASUREMENTS.filter((f) => CORE_MEASUREMENT_KEYS.includes(f.key) || filled(f.key));
  const checked = validateMeasurements(fields, parsed.data.values);
  if (!checked.ok) return fail(Object.values(checked.errors)[0]);

  try {
    const session = await activeAgentSession();
    if (!session) return fail(NOT_AGENT);
    return ok(await recordVisitMeasurements(session.supabase, { visitId: parsed.data.visitId, values: checked.values }));
  } catch (error) {
    return fail(visitError(error));
  }
}

const cancelVisitSchema = z.object({ visitId: z.string().uuid() });

export async function cancelVisitAction(input: z.infer<typeof cancelVisitSchema>): Promise<ActionResult<VisitRow>> {
  const parsed = cancelVisitSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");

  try {
    const session = await activeAgentSession();
    if (!session) return fail(NOT_AGENT);
    return ok(await cancelVisit(session.supabase, parsed.data.visitId));
  } catch (error) {
    return fail(visitError(error));
  }
}
