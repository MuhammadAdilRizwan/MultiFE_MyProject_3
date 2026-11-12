"use server";

import { z } from "zod";
import { getLatestConfirmedProfile } from "@multife/backend/modules/measurements/getMeasurementProfile";
import { saveMyMeasurements, validateMyMeasurements } from "@multife/backend/modules/measurements/saveMyMeasurements";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { activeCustomer } from "@/lib/active-customer";

// Saved measurements in the customer's account (FR-CUS-15). Runs on the
// customer's own session, so RLS keeps each customer to their own profiles.
// Values are logged nowhere (FR-AI-10).

export type SavedMeasurements = {
  values: Record<string, number>;
  confirmedAt: string;
  // Who took them: the customer, or an agent on a visit / order.
  confirmedBy: "customer" | "agent";
} | null;

const NOT_CUSTOMER = "Sign in with your customer account to manage your measurements.";
const GENERIC_ERROR = "We couldn't save your measurements. Please try again.";

const toSaved = (row: Awaited<ReturnType<typeof getLatestConfirmedProfile>>): SavedMeasurements =>
  row?.confirmed_at
    ? {
        values: row.measurement_values,
        confirmedAt: row.confirmed_at,
        confirmedBy: row.confirmed_by_role === "agent" ? "agent" : "customer",
      }
    : null;

export async function getMyMeasurementsAction(): Promise<ActionResult<SavedMeasurements>> {
  try {
    const me = await activeCustomer();
    if (!me) return fail(NOT_CUSTOMER);
    return ok(toSaved(await getLatestConfirmedProfile(me.supabase, me.customerId)));
  } catch (error) {
    console.error("getMyMeasurements failed:", error instanceof Error ? error.message : "unknown error");
    return fail("We couldn't load your measurements. Please refresh to try again.");
  }
}

const saveSchema = z.object({
  values: z.record(z.string().max(40), z.union([z.number(), z.string().max(12)])),
  confirmed: z.literal(true),
});

export async function saveMyMeasurementsAction(input: z.infer<typeof saveSchema>): Promise<ActionResult<SavedMeasurements>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail("Please confirm your measurements are correct.");

  try {
    const me = await activeCustomer();
    if (!me) return fail(NOT_CUSTOMER);

    const checked = validateMyMeasurements(parsed.data.values);
    if (!checked.ok) return fail(Object.values(checked.errors)[0]);

    return ok(toSaved(await saveMyMeasurements(me.supabase, { customerId: me.customerId, values: checked.values })));
  } catch (error) {
    console.error("saveMyMeasurements failed:", error instanceof Error ? error.message : "unknown error");
    return fail(GENERIC_ERROR);
  }
}
