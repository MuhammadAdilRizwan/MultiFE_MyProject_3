import { describe, expect, it, vi } from "vitest";
import { recordAuditEvent } from "./recordAuditEvent";
import type { SupabaseClient } from "@supabase/supabase-js";

function clientWith(error: { message: string } | null) {
  const insert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as unknown as SupabaseClient, from, insert };
}

describe("recordAuditEvent", () => {
  it("writes the event to audit_log with who did it, what, and the details", async () => {
    const { client, from, insert } = clientWith(null);

    await recordAuditEvent(client, {
      action: "user.invite",
      actorId: "admin-1",
      entity: "profiles",
      entityId: "user-9",
      details: { role: "tailor" },
    });

    expect(from).toHaveBeenCalledWith("audit_log");
    expect(insert).toHaveBeenCalledWith({
      actor_id: "admin-1",
      action: "user.invite",
      entity: "profiles",
      entity_id: "user-9",
      after: { role: "tailor" },
    });
  });

  it("records system events that have no actor, entity id or details", async () => {
    const { client, insert } = clientWith(null);

    await recordAuditEvent(client, { action: "security.rate_limited", entity: "auth" });

    expect(insert).toHaveBeenCalledWith({
      actor_id: null,
      action: "security.rate_limited",
      entity: "auth",
      entity_id: null,
      after: null,
    });
  });

  it("throws when the write fails, so the caller decides whether that matters", async () => {
    const { client } = clientWith({ message: "db down" });
    await expect(recordAuditEvent(client, { action: "x.y", entity: "auth" })).rejects.toMatchObject({ message: "db down" });
  });
});
