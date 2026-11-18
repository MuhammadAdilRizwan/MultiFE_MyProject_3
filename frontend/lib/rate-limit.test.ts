import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const headerValues: Record<string, string> = {};
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerValues[name.toLowerCase()] ?? null }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ admin: true })) }));
vi.mock("@multife/backend/modules/users/checkRateLimit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@multife/backend/modules/audit/recordAuditEvent", () => ({ recordAuditEvent: vi.fn() }));

import { checkRateLimit } from "@multife/backend/modules/users/checkRateLimit";
import { recordAuditEvent } from "@multife/backend/modules/audit/recordAuditEvent";
import { isRateLimited, RATE_LIMITED_MESSAGE } from "./rate-limit";

type Call = { key: string; limit: number; windowSeconds: number };
const calls = (): Call[] => vi.mocked(checkRateLimit).mock.calls.map((c) => c[1] as Call);

describe("isRateLimited", () => {
  beforeEach(() => {
    for (const k of Object.keys(headerValues)) delete headerValues[k];
    headerValues["x-forwarded-for"] = "203.0.113.7, 10.0.0.1";
    vi.mocked(checkRateLimit).mockReset();
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    vi.mocked(recordAuditEvent).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets the attempt through while every bucket has room", async () => {
    await expect(isRateLimited("sign_in", "a@x.com")).resolves.toBe(false);
  });

  it("blocks the attempt when any bucket is full", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(isRateLimited("sign_in", "a@x.com")).resolves.toBe(true);
  });

  it("counts both the caller's address and the email", async () => {
    await isRateLimited("sign_in", "a@x.com");
    const keys = calls().map((c) => c.key);
    expect(keys).toHaveLength(2);
    expect(keys.some((k) => k.startsWith("sign_in:ip:"))).toBe(true);
    expect(keys.some((k) => k.startsWith("sign_in:email:"))).toBe(true);
  });

  it("never stores the raw email or IP in a key", async () => {
    await isRateLimited("sign_in", "a@x.com");
    const joined = calls().map((c) => c.key).join(" ");
    expect(joined).not.toContain("a@x.com");
    expect(joined).not.toContain("203.0.113.7");
  });

  it("treats the same email in different letter case as one", async () => {
    await isRateLimited("sign_in", "A@X.com");
    await isRateLimited("sign_in", " a@x.com ");
    const emailKeys = calls().map((c) => c.key).filter((k) => k.includes(":email:"));
    expect(new Set(emailKeys).size).toBe(1);
  });

  it("uses the first address in x-forwarded-for, the client's, not a proxy's", async () => {
    await isRateLimited("sign_in", "a@x.com");
    headerValues["x-forwarded-for"] = "203.0.113.7";
    await isRateLimited("sign_in", "b@x.com");
    const ipKeys = calls().map((c) => c.key).filter((k) => k.includes(":ip:"));
    expect(new Set(ipKeys).size).toBe(1);
  });

  it("keeps different actions in separate buckets", async () => {
    await isRateLimited("sign_in", "a@x.com");
    await isRateLimited("password_reset", "a@x.com");
    const keys = calls().map((c) => c.key);
    expect(new Set(keys).size).toBe(4);
  });

  it("allows 8 sign-in tries per email in 10 minutes", async () => {
    await isRateLimited("sign_in", "a@x.com");
    const email = calls().find((c) => c.key.includes(":email:"))!;
    expect(email.limit).toBe(8);
    expect(email.windowSeconds).toBe(600);
  });

  it("is stricter for password reset emails than for sign-in", async () => {
    await isRateLimited("password_reset", "a@x.com");
    const email = calls().find((c) => c.key.includes(":email:"))!;
    expect(email.limit).toBe(3);
    expect(email.windowSeconds).toBe(3600);
  });

  it("lets the attempt through, and logs, if the counter itself fails (auth must stay available)", async () => {
    vi.mocked(checkRateLimit).mockRejectedValue(new Error("db down"));
    await expect(isRateLimited("sign_in", "a@x.com")).resolves.toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  describe("when an attempt is blocked", () => {
    // Order of calls: ip bucket, email bucket, then (if blocked) the
    // once-per-window audit gate for the bucket that said no.
    it("records one security event saying which action and which limit tripped", async () => {
      vi.mocked(checkRateLimit)
        .mockResolvedValueOnce(true) // ip bucket ok
        .mockResolvedValueOnce(false) // email bucket full
        .mockResolvedValueOnce(true); // audit gate: first block in this window
      await isRateLimited("sign_in", "a@x.com");

      expect(recordAuditEvent).toHaveBeenCalledTimes(1);
      expect(recordAuditEvent).toHaveBeenCalledWith(
        { admin: true },
        { action: "security.rate_limited", entity: "auth", details: { attempt: "sign_in", scope: "email", limit: 8, window_seconds: 600 } },
      );
    });

    it("does not record again while the same bucket keeps blocking (no log flooding)", async () => {
      vi.mocked(checkRateLimit)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false); // audit gate already used this window
      await isRateLimited("sign_in", "a@x.com");

      expect(recordAuditEvent).not.toHaveBeenCalled();
    });

    it("keeps the event free of the raw email and address", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      await isRateLimited("sign_in", "a@x.com");

      const logged = JSON.stringify(vi.mocked(recordAuditEvent).mock.calls);
      expect(logged).not.toContain("a@x.com");
      expect(logged).not.toContain("203.0.113.7");
    });

    it("still blocks the attempt if writing the event fails", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      vi.mocked(recordAuditEvent).mockRejectedValue(new Error("db down"));
      await expect(isRateLimited("sign_in", "a@x.com")).resolves.toBe(true);
    });
  });

  it("has a message for the person who is blocked", () => {
    expect(RATE_LIMITED_MESSAGE).toBe("Too many attempts. Please wait a few minutes and try again.");
  });
});
