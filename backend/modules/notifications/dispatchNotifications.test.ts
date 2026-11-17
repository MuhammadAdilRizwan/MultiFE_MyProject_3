import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchNotifications, emailConfigFromEnv } from "./dispatchNotifications";

function serviceClient(rows: unknown[]) {
  const rpc = vi.fn((fn: string) =>
    Promise.resolve(fn === "fn_claim_notifications" ? { data: rows, error: null } : { data: null, error: null }),
  );
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const row = (id: string) => ({
  id,
  recipient: `${id}@example.pk`,
  template: "order_placed",
  payload: { order_number: "MF-2026-000001" },
});

describe("emailConfigFromEnv", () => {
  it("needs the key, the from address and the site URL", () => {
    expect(emailConfigFromEnv({ RESEND_API_KEY: "k", NOTIFY_FROM_EMAIL: "MultiFe <o@x.pk>" })).toBeNull();
    expect(emailConfigFromEnv({ RESEND_API_KEY: "k", NOTIFY_FROM_EMAIL: "o@x.pk", NEXT_PUBLIC_SITE_URL: "https://x.pk" })).toEqual({
      apiKey: "k",
      from: "o@x.pk",
      siteUrl: "https://x.pk",
    });
  });
});

describe("dispatchNotifications", () => {
  it("does nothing until email is configured", async () => {
    const { client, rpc } = serviceClient([row("a")]);
    expect(await dispatchNotifications(client, null)).toEqual({ configured: false, claimed: 0, sent: 0, failed: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends each claimed email and records success or failure", async () => {
    const { client, rpc } = serviceClient([row("a"), row("b")]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 429 }));

    const result = await dispatchNotifications(client, { apiKey: "key", from: "o@x.pk", siteUrl: "https://x.pk", fetchImpl });
    expect(result).toEqual({ configured: true, claimed: 2, sent: 1, failed: 1 });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer key", "Idempotency-Key": "outbox-a" });
    expect(JSON.parse(init.body)).toMatchObject({ from: "o@x.pk", to: ["a@example.pk"] });

    expect(rpc).toHaveBeenCalledWith("fn_finish_notification", { p_id: "a", p_ok: true, p_error: null });
    expect(rpc).toHaveBeenCalledWith("fn_finish_notification", { p_id: "b", p_ok: false, p_error: "Resend 429" });
  });

  it("records a network error as a failed attempt", async () => {
    const { client, rpc } = serviceClient([row("a")]);
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const result = await dispatchNotifications(client, { apiKey: "k", from: "o@x.pk", siteUrl: "https://x.pk", fetchImpl });
    expect(result.failed).toBe(1);
    expect(rpc).toHaveBeenCalledWith("fn_finish_notification", { p_id: "a", p_ok: false, p_error: "TypeError" });
  });
});
