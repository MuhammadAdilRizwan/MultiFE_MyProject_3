import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuditEventParams {
  action: string;
  entity: string;
  actorId?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
}

// Writes one row to audit_log (FR-ADM-10). audit_log has no insert policy for
// signed-in users, so pass the service-role client. Keep `details` free of
// emails, addresses and measurements — admins read this log, and it's a
// record of what happened, not a copy of customer data.
export async function recordAuditEvent(
  supabase: SupabaseClient,
  { action, entity, actorId = null, entityId = null, details = null }: AuditEventParams,
): Promise<void> {
  const { error } = await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity,
    entity_id: entityId,
    after: details,
  });
  if (error) throw error;
}
