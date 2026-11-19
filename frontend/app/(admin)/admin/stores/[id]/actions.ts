"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAuditEvent } from "@multife/backend/modules/audit/recordAuditEvent";
import { configureSupplier } from "@multife/backend/modules/suppliers/configureSupplier";
import { PROVIDER_KINDS, type SupplierIntegration } from "@multife/backend/modules/suppliers/types";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { activeAdmin } from "@/lib/active-admin";
import { describeError } from "@/lib/describe-error";
import { createAdminClient } from "@/lib/supabase/admin";

const configureSchema = z.object({
  supplierId: z.string().uuid(),
  providerKind: z.enum(PROVIDER_KINDS),
  baseUrl: z.string().trim().max(500).optional(),
  capabilities: z.object({
    catalogue_read: z.boolean(),
    stock_read: z.boolean(),
    order_write: z.boolean(),
    status_callback: z.boolean(),
  }),
});

const auditShape = (i: SupplierIntegration | null) =>
  i ? { provider_kind: i.providerKind, base_url: i.baseUrl, capabilities: i.capabilities } : null;

// FR-ADM-03: an admin sets how a store connects and what its system can do.
// Written with the admin's own session (RLS "supplier_integrations: admin
// all"); audited (FR-ADM-10). No credentials are accepted (FR-FAB-14).
export async function configureSupplierAction(
  input: z.infer<typeof configureSchema>,
): Promise<ActionResult<SupplierIntegration>> {
  const parsed = configureSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const admin = await activeAdmin();
    if (!admin) return fail("Only an admin can do this.");

    const { supplierId, providerKind, baseUrl, capabilities } = parsed.data;
    const { before, after } = await configureSupplier(admin.supabase, {
      supplierId,
      // A store's API address only means something for an API connection.
      providerKind,
      baseUrl: providerKind === "api" ? baseUrl : null,
      capabilities,
    });

    // audit_log is written by the service role only; the change is already
    // saved, so a failed audit write is logged rather than reported.
    await recordAuditEvent(createAdminClient(), {
      action: "supplier.configure",
      actorId: admin.adminId,
      entity: "suppliers",
      entityId: supplierId,
      details: { before: auditShape(before), ...auditShape(after) },
    }).catch((auditError) =>
      console.error("could not record supplier.configure:", auditError instanceof Error ? auditError.name : "unknown error"),
    );

    revalidatePath(`/admin/stores/${supplierId}`);
    return ok(after);
  } catch (error) {
    return fail(describeError(error));
  }
}
