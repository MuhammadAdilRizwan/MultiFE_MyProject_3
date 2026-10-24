"use server";

import { z } from "zod";
import { AuthError } from "@multife/backend/modules/users/errors";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import {
  inviteAdmin,
  inviteAgent,
  inviteProductionStaff,
  inviteSupplierContact,
} from "@multife/backend/modules/users/inviteUser";
import { requestPasswordReset } from "@multife/backend/modules/users/requestPasswordReset";
import { signInWithPassword } from "@multife/backend/modules/users/signIn";
import { signOutUser } from "@multife/backend/modules/users/signOut";
import { signUpCustomer } from "@multife/backend/modules/users/signUp";
import { updatePassword } from "@multife/backend/modules/users/updatePassword";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;

function authCallbackUrl(next?: string) {
  const url = new URL("/auth/callback", SITE_URL);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

function describe(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
});

export async function signUpAction(
  input: z.infer<typeof signUpSchema>,
): Promise<ActionResult<{ userId: string | null; confirmed: boolean }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const result = await signUpCustomer(supabase, {
      ...parsed.data,
      emailRedirectTo: authCallbackUrl(),
    });
    return ok({ userId: result.userId, confirmed: result.session });
  } catch (error) {
    return fail(describe(error));
  }
}

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function signInAction(
  input: z.infer<typeof signInSchema>,
): Promise<ActionResult<{ userId: string; role: string }>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const result = await signInWithPassword(supabase, parsed.data);
    return ok({ userId: result.userId, role: result.profile.role });
  } catch (error) {
    return fail(describe(error));
  }
}

export async function signOutAction(): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    await signOutUser(supabase);
    return ok(null);
  } catch (error) {
    return fail(describe(error));
  }
}

const requestPasswordResetSchema = z.object({ email: z.string().email() });

export async function requestPasswordResetAction(
  input: z.infer<typeof requestPasswordResetSchema>,
): Promise<ActionResult<null>> {
  const parsed = requestPasswordResetSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    await requestPasswordReset(supabase, {
      email: parsed.data.email,
      redirectTo: authCallbackUrl("/reset-password"),
    });
    return ok(null);
  } catch (error) {
    return fail(describe(error));
  }
}

const updatePasswordSchema = z.object({ password: z.string().min(8) });

export async function updatePasswordAction(
  input: z.infer<typeof updatePasswordSchema>,
): Promise<ActionResult<null>> {
  const parsed = updatePasswordSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    await updatePassword(supabase, parsed.data);
    return ok(null);
  } catch (error) {
    return fail(describe(error));
  }
}

// FR-AUTH-03: every role but customer joins by invite from an admin only —
// there is no shop-owner tier in v2.0 that can invite its own staff, so this
// single action (admin-only) replaces the separate shopkeeper/admin invites.
const inviteUserSchema = z
  .object({
    role: z.enum(["admin", "agent", "tailor", "qc", "dispatch", "supplier_contact"]),
    email: z.string().email(),
    fullName: z.string().min(1).optional(),
    agentCode: z.string().min(1).optional(),
    region: z.string().optional(),
    supplierId: z.string().uuid().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.role === "supplier_contact" && !val.supplierId) {
      ctx.addIssue({
        code: "custom",
        message: "supplierId is required to invite a supplier contact.",
        path: ["supplierId"],
      });
    }
  });

export async function inviteUserAction(
  input: z.infer<typeof inviteUserSchema>,
): Promise<ActionResult<{ userId: string }>> {
  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { role, email, fullName, agentCode, region, supplierId } = parsed.data;

  try {
    const supabase = await createClient();
    const actor = await getCurrentProfile(supabase);
    if (actor?.role !== "admin" || actor.status !== "active") {
      return fail("Only an admin can send invites.");
    }

    const adminClient = createAdminClient();
    const redirectTo = authCallbackUrl();

    const result =
      role === "admin"
        ? await inviteAdmin(adminClient, { email, fullName }, redirectTo)
        : role === "agent"
          ? await inviteAgent(adminClient, { email, fullName, agentCode, region }, redirectTo)
          : role === "supplier_contact"
            ? await inviteSupplierContact(adminClient, { email, fullName, supplierId: supplierId! }, redirectTo)
            : await inviteProductionStaff(adminClient, role, { email, fullName }, redirectTo);

    return ok(result);
  } catch (error) {
    return fail(describe(error));
  }
}
