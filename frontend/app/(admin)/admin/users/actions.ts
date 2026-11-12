"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setAccountStatus } from "@multife/backend/modules/users/adminUsers";
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
