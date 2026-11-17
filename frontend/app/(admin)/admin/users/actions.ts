"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ASSIGNABLE_ROLES, setAccountStatus, setUserRole } from "@multife/backend/modules/users/adminUsers";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { activeAdmin } from "@/lib/active-admin";

// FR-ADM-05: suspend or reactivate an account. fn_admin_set_account_status
// re-checks admin, refuses self-suspension, and writes the audit entry.

const schema = z.discriminatedUnion("status", [
  z.object({
    userId: z.string().uuid(),
    status: z.literal("suspended"),
    reason: z.string().trim().min(3, "Give a short reason for suspending.").max(300, "Keep the reason under 300 characters."),
  }),
  z.object({ userId: z.string().uuid(), status: z.literal("active"), reason: z.string().trim().max(300).optional() }),
]);

const SAFE = ["You cannot change your own account status", "User not found"];

export async function setAccountStatusAction(input: z.infer<typeof schema>): Promise<ActionResult<{ status: "active" | "suspended" }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const admin = await activeAdmin();
    if (!admin) return fail("Sign in as an active admin to manage users.");
    if (parsed.data.userId === admin.adminId) return fail("You cannot change your own account status.");

    const status = await setAccountStatus(admin.supabase, {
      userId: parsed.data.userId,
      status: parsed.data.status,
      reason: parsed.data.reason || undefined,
    });
    revalidatePath("/admin/users");
    return ok({ status });
  } catch (error) {
    const message = (error as { message?: string })?.message ?? "";
    if (SAFE.includes(message)) return fail(`${message}.`);
    console.error("setAccountStatus failed:", message || "unknown error");
    return fail("We couldn't update this account. Please try again.");
  }
}

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ASSIGNABLE_ROLES),
  agentCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,20}$/, "Agent code: 3 to 20 letters, digits or dashes.")
    .optional()
    .or(z.literal("")),
});

// Messages from fn_admin_set_role that are safe to show as they are.
const ROLE_MESSAGES = [
  /^You cannot change your own role$/,
  /^Reassign their \d+ open job\(s\) first$/,
  /^Give the new agent a code, e\.g\. AG-012$/,
  /^That agent code is already used$/,
  /^Agent code: 3 to 20 letters, digits or dashes$/,
  /^Store contacts need a store: invite them from Invite users$/,
  /^User not found$/,
];

// FR-ADM-05: change someone's role, e.g. make a new account a tailor.
export async function setUserRoleAction(input: z.infer<typeof roleSchema>): Promise<ActionResult<{ role: string }>> {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const admin = await activeAdmin();
    if (!admin) return fail("Sign in as an active admin to manage users.");
    if (parsed.data.userId === admin.adminId) return fail("You cannot change your own role.");

    const role = await setUserRole(admin.supabase, {
      userId: parsed.data.userId,
      role: parsed.data.role,
      agentCode: parsed.data.agentCode || undefined,
    });
    revalidatePath("/admin/users");
    return ok({ role });
  } catch (error) {
    const message = (error as { message?: string })?.message ?? "";
    if (ROLE_MESSAGES.some((re) => re.test(message))) return fail(`${message}.`);
    console.error("setUserRole failed:", message || "unknown error");
    return fail("We couldn't change this role. Please try again.");
  }
}
