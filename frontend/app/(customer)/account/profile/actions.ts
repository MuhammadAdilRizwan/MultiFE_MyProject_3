"use server";

import { z } from "zod";
import { getMyProfile, updateMyProfile, type MyProfile } from "@multife/backend/modules/users/myProfile";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { activeCustomer } from "@/lib/active-customer";
import { toInternationalPhone } from "@/lib/phone";

// The customer's own details (FR-CUS-16): name, contact phone and a saved
// delivery address. Session client only (RLS: own row). Email is the
// sign-in identity and is not changed here. No PII in logs.

const NOT_CUSTOMER = "Sign in with your customer account to manage your details.";

export async function getMyProfileAction(): Promise<ActionResult<MyProfile>> {
  try {
    const me = await activeCustomer();
    if (!me) return fail(NOT_CUSTOMER);
    const profile = await getMyProfile(me.supabase, me.customerId);
    return profile ? ok(profile) : fail(NOT_CUSTOMER);
  } catch (error) {
    console.error("getMyProfile failed:", error instanceof Error ? error.message : "unknown error");
    return fail("We couldn't load your details. Please refresh to try again.");
  }
}

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name.").max(80, "Keep your name under 80 characters."),
    phone: z.string().trim().max(24),
    addressLine: z.string().trim().max(200, "Keep the address under 200 characters."),
    city: z.string().trim().max(60, "Keep the city under 60 characters."),
  })
  .superRefine((v, ctx) => {
    // The address is optional, but a half-filled one can't be used at checkout.
    if (v.addressLine && v.addressLine.length < 8) ctx.addIssue({ code: "custom", path: ["addressLine"], message: "Enter the full address." });
    if (v.addressLine && v.city.length < 2) ctx.addIssue({ code: "custom", path: ["city"], message: "Enter the city." });
    if (!v.addressLine && v.city) ctx.addIssue({ code: "custom", path: ["addressLine"], message: "Enter the address for this city." });
  });

export type ProfileInput = z.infer<typeof schema>;

export async function updateMyProfileAction(input: ProfileInput): Promise<ActionResult<MyProfile> & { field?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ...fail<MyProfile>(issue?.message ?? "Please check your details."), field: issue?.path[0]?.toString() };
  }
  const { fullName, phone, addressLine, city } = parsed.data;

  const intlPhone = phone ? toInternationalPhone(phone) : null;
  if (phone && !intlPhone) return { ...fail<MyProfile>("Enter a valid phone number, like 0300 1234567."), field: "phone" };

  try {
    const me = await activeCustomer();
    if (!me) return fail(NOT_CUSTOMER);
    const updated = await updateMyProfile(me.supabase, {
      userId: me.customerId,
      fullName,
      phone: intlPhone,
      address: addressLine ? { address_line: addressLine, city } : null,
    });
    return ok(updated);
  } catch (error) {
    console.error("updateMyProfile failed:", error instanceof Error ? error.message : "unknown error");
    return fail("We couldn't save your details. Please try again.");
  }
}
