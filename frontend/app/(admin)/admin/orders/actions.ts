"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addOrderNote, adminCancelOrder } from "@multife/backend/modules/orders/adminOrders";
import { markFabricSecured } from "@multife/backend/modules/orders/markFabricSecured";
import { assignProductionJob } from "@multife/backend/modules/production/assignProductionJob";
import { createRemake } from "@multife/backend/modules/production/createRemake";
import { listProductionStaff } from "@multife/backend/modules/production/listProductionStaff";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { activeAdmin } from "@/lib/active-admin";
import { describeError } from "@/lib/describe-error";
import { kickNotifications } from "@/lib/notifications";

// Admin steps that get an order into the workshop. fn_transition_order and
// RLS ("production_jobs: admin all") re-check the admin role.

const NOT_ADMIN = "Sign in as an active admin to manage orders.";

const orderSchema = z.object({ orderId: z.string().uuid(), orderNumber: z.string().regex(/^MF-\d{4}-\d{6}$/) });

// The order's fabric is secured from the store (placed -> fabric_secured).
export async function markFabricSecuredAction(input: z.infer<typeof orderSchema>): Promise<ActionResult<{ status: string }>> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");

  try {
    const admin = await activeAdmin();
    if (!admin) return fail(NOT_ADMIN);
    const result = await markFabricSecured(admin.supabase, parsed.data.orderId);
    revalidatePath(`/admin/orders/${parsed.data.orderNumber}`);
    return ok(result);
  } catch (error) {
    return fail(describeError(error));
  }
}

const assignSchema = z.object({
  jobId: z.string().uuid(),
  staffId: z.string().uuid("Choose who will make this outfit."),
  orderNumber: z.string().regex(/^MF-\d{4}-\d{6}$/),
});

// FR-PRD-05: give the job to an active tailor or QC. Checked here because the
// table itself accepts any profile id.
export async function assignJobAction(input: z.infer<typeof assignSchema>): Promise<ActionResult<{ assignedToId: string }>> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const admin = await activeAdmin();
    if (!admin) return fail(NOT_ADMIN);
    const staff = await listProductionStaff(admin.supabase);
    if (!staff.some((s) => s.id === parsed.data.staffId)) return fail("Choose an active tailor or QC member.");

    await assignProductionJob(admin.supabase, { jobId: parsed.data.jobId, assignedToId: parsed.data.staffId });
    revalidatePath(`/admin/orders/${parsed.data.orderNumber}`);
    return ok({ assignedToId: parsed.data.staffId });
  } catch (error) {
    return fail(describeError(error));
  }
}

const remakeSchema = z.object({
  jobId: z.string().uuid(),
  staffId: z.string().uuid("Choose who will remake this outfit."),
  metresLost: z.number().min(0, "Enter the fabric lost in metres.").max(100, "Enter the fabric lost in metres (0 to 100)."),
  orderNumber: z.string().regex(/^MF-\d{4}-\d{6}$/),
});

// FR-PRD-06/07: a job that failed QC for good is remade. fn_create_remake
// re-checks the admin, the failed job and the assignee, records the loss and
// sends the order back to cutting.
export async function createRemakeAction(input: z.infer<typeof remakeSchema>): Promise<ActionResult<{ jobId: string }>> {
  const parsed = remakeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const admin = await activeAdmin();
    if (!admin) return fail(NOT_ADMIN);
    const job = await createRemake(admin.supabase, {
      jobId: parsed.data.jobId,
      metresLost: parsed.data.metresLost,
      assignTo: parsed.data.staffId,
    });
    revalidatePath(`/admin/orders/${parsed.data.orderNumber}`);
    return ok({ jobId: job.id });
  } catch (error) {
    return fail(describeError(error));
  }
}

const cancelSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string().regex(/^MF-\d{4}-\d{6}$/),
  reason: z.string().trim().min(3, "Give a reason for cancelling.").max(300, "Keep the reason under 300 characters."),
});

// Database messages that are safe to show as they are.
const ORDER_MESSAGES = [/^Order MF-\d{4}-\d{6} is already \w+$/, /^A reason is required$/];

// FR-ADM-06 / FR-ORD-08: cancel at any point before delivery, with a reason.
// fn_transition_order releases the fabric, raises a refund record when the
// order was paid, writes history and audit, and queues the customer's email.
export async function adminCancelOrderAction(input: z.infer<typeof cancelSchema>): Promise<ActionResult<{ paymentStatus: string }>> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const admin = await activeAdmin();
    if (!admin) return fail(NOT_ADMIN);
    const result = await adminCancelOrder(admin.supabase, { orderId: parsed.data.orderId, reason: parsed.data.reason });
    kickNotifications(); // order_cancelled email
    revalidatePath(`/admin/orders/${parsed.data.orderNumber}`);
    return ok({ paymentStatus: result.payment_status });
  } catch (error) {
    const message = describeError(error);
    return fail(ORDER_MESSAGES.some((re) => re.test(message)) ? `${message}.` : "We couldn't cancel this order. Please try again.");
  }
}

const noteSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string().regex(/^MF-\d{4}-\d{6}$/),
  kind: z.enum(["note", "dispute_opened", "dispute_resolved"]),
  body: z.string().trim().min(3, "Write at least a few words.").max(1000, "Keep it under 1000 characters."),
});

const NOTE_MESSAGES = ["A dispute is already open on this order", "There is no open dispute on this order"];

// UC-12: an internal note (customers never see these), or opening / resolving
// a dispute with a note saying why.
export async function addOrderNoteAction(input: z.infer<typeof noteSchema>): Promise<ActionResult<null>> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const admin = await activeAdmin();
    if (!admin) return fail(NOT_ADMIN);
    await addOrderNote(admin.supabase, { orderId: parsed.data.orderId, kind: parsed.data.kind, body: parsed.data.body });
    revalidatePath(`/admin/orders/${parsed.data.orderNumber}`);
    return ok(null);
  } catch (error) {
    const message = describeError(error);
    return fail(NOTE_MESSAGES.includes(message) ? `${message}.` : "We couldn't save the note. Please try again.");
  }
}
