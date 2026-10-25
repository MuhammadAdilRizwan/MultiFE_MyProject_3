"use server";

import { z } from "zod";
import { createOptionGroup } from "@multife/backend/modules/catalog/createOptionGroup";
import { createOptionValue } from "@multife/backend/modules/catalog/createOptionValue";
import { createSupplier } from "@multife/backend/modules/catalog/createSupplier";
import { createTemplate } from "@multife/backend/modules/catalog/createTemplate";
import { createTemplateOption } from "@multife/backend/modules/catalog/createTemplateOption";
import { setFabricAvailability } from "@multife/backend/modules/catalog/setFabricAvailability";
import { setSupplierStatus } from "@multife/backend/modules/catalog/setSupplierStatus";
import { setTemplatePublished } from "@multife/backend/modules/catalog/setTemplatePublished";
import { updateTemplate } from "@multife/backend/modules/catalog/updateTemplate";
import type { AnySupabaseClient } from "@multife/backend/modules/catalog/types";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { describeError } from "@/lib/describe-error";
import { createClient } from "@/lib/supabase/server";

// Every write here is admin-only, same gate as inviteUserAction.
async function ensureAdmin(supabase: AnySupabaseClient): Promise<ActionResult<never> | null> {
  const actor = await getCurrentProfile(supabase);
  if (actor?.role !== "admin" || actor.status !== "active") {
    return fail("Only an admin can do this.");
  }
  return null;
}

const requiredMeasurementSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().min(1),
  min: z.number(),
  max: z.number(),
});
const yardageFormulaSchema = z.object({
  base_metres: z.number().min(0),
  coefficients: z.record(z.string(), z.number()),
  wastage_margin: z.number().min(0),
});

const createSupplierSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  contact: z.record(z.string(), z.unknown()).optional(),
});

export async function createSupplierAction(
  input: z.infer<typeof createSupplierSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof createSupplier>>>> {
  const parsed = createSupplierSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const denied = await ensureAdmin(supabase);
    if (denied) return denied;

    return ok(await createSupplier(supabase, parsed.data));
  } catch (error) {
    return fail(describeError(error));
  }
}

const setSupplierStatusSchema = z.object({
  supplierId: z.string().uuid(),
  status: z.enum(["pending", "active", "suspended"]),
});

export async function setSupplierStatusAction(
  input: z.infer<typeof setSupplierStatusSchema>,
): Promise<ActionResult<null>> {
  const parsed = setSupplierStatusSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const denied = await ensureAdmin(supabase);
    if (denied) return denied;

    await setSupplierStatus(supabase, parsed.data.supplierId, parsed.data.status);
    return ok(null);
  } catch (error) {
    return fail(describeError(error));
  }
}

const createTemplateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  description: z.string().optional(),
  baseStitchPrice: z.number().min(0).optional(),
  leadDays: z.number().int().min(0).optional(),
  requiredMeasurements: z.array(requiredMeasurementSchema).optional(),
  recommendedOptions: z.record(z.string(), z.string()).optional(),
  yardageFormula: yardageFormulaSchema.optional(),
});

export async function createTemplateAction(
  input: z.infer<typeof createTemplateSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof createTemplate>>>> {
  const parsed = createTemplateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const denied = await ensureAdmin(supabase);
    if (denied) return denied;

    return ok(await createTemplate(supabase, parsed.data));
  } catch (error) {
    return fail(describeError(error));
  }
}

const updateTemplateSchema = z.object({
  templateId: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  baseStitchPrice: z.number().min(0).optional(),
  leadDays: z.number().int().min(0).optional(),
  requiredMeasurements: z.array(requiredMeasurementSchema).optional(),
  recommendedOptions: z.record(z.string(), z.string()).optional(),
  yardageFormula: yardageFormulaSchema.optional(),
});

export async function updateTemplateAction(
  input: z.infer<typeof updateTemplateSchema>,
): Promise<ActionResult<null>> {
  const parsed = updateTemplateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const denied = await ensureAdmin(supabase);
    if (denied) return denied;

    const { templateId, ...patch } = parsed.data;
    await updateTemplate(supabase, templateId, patch);
    return ok(null);
  } catch (error) {
    return fail(describeError(error));
  }
}

const setTemplatePublishedSchema = z.object({ templateId: z.string().uuid(), isPublished: z.boolean() });

export async function setTemplatePublishedAction(
  input: z.infer<typeof setTemplatePublishedSchema>,
): Promise<ActionResult<null>> {
  const parsed = setTemplatePublishedSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const denied = await ensureAdmin(supabase);
    if (denied) return denied;

    await setTemplatePublished(supabase, parsed.data.templateId, parsed.data.isPublished);
    return ok(null);
  } catch (error) {
    return fail(describeError(error));
  }
}

const createOptionGroupSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  sort: z.number().int().optional(),
});

export async function createOptionGroupAction(
  input: z.infer<typeof createOptionGroupSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof createOptionGroup>>>> {
  const parsed = createOptionGroupSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const denied = await ensureAdmin(supabase);
    if (denied) return denied;

    return ok(await createOptionGroup(supabase, parsed.data));
  } catch (error) {
    return fail(describeError(error));
  }
}

const createOptionValueSchema = z.object({
  groupId: z.string().uuid(),
  key: z.string().min(1),
  label: z.string().min(1),
  imageUrl: z.string().url().optional(),
  sort: z.number().int().optional(),
});

export async function createOptionValueAction(
  input: z.infer<typeof createOptionValueSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof createOptionValue>>>> {
  const parsed = createOptionValueSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const denied = await ensureAdmin(supabase);
    if (denied) return denied;

    return ok(await createOptionValue(supabase, parsed.data));
  } catch (error) {
    return fail(describeError(error));
  }
}

const createTemplateOptionSchema = z.object({
  templateId: z.string().uuid(),
  groupId: z.string().uuid(),
  valueId: z.string().uuid(),
  priceDelta: z.number().optional(),
  extraLeadDays: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
});

export async function createTemplateOptionAction(
  input: z.infer<typeof createTemplateOptionSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof createTemplateOption>>>> {
  const parsed = createTemplateOptionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const denied = await ensureAdmin(supabase);
    if (denied) return denied;

    return ok(await createTemplateOption(supabase, parsed.data));
  } catch (error) {
    return fail(describeError(error));
  }
}

const setFabricAvailabilitySchema = z.object({ fabricId: z.string().uuid(), isAvailable: z.boolean() });

// FR-TPL-10 lands here via setFabricAvailability itself (CatalogError) — the
// action just surfaces whatever message it throws.
export async function setFabricAvailabilityAction(
  input: z.infer<typeof setFabricAvailabilitySchema>,
): Promise<ActionResult<null>> {
  const parsed = setFabricAvailabilitySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const supabase = await createClient();
    const denied = await ensureAdmin(supabase);
    if (denied) return denied;

    await setFabricAvailability(supabase, parsed.data.fabricId, parsed.data.isAvailable);
    return ok(null);
  } catch (error) {
    return fail(describeError(error));
  }
}
