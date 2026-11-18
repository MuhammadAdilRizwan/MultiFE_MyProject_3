import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { recordAuditEvent } from "@multife/backend/modules/audit/recordAuditEvent";
import { checkRateLimit } from "@multife/backend/modules/users/checkRateLimit";
import { createAdminClient } from "@/lib/supabase/admin";

export const RATE_LIMITED_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";

export type RateLimitedAction = "sign_in" | "sign_up" | "password_reset";

// Per action: how many tries one address, and one email, get per window.
const POLICY: Record<RateLimitedAction, { ip: Bucket; email: Bucket }> = {
  sign_in: { ip: { limit: 20, windowSeconds: 600 }, email: { limit: 8, windowSeconds: 600 } },
  sign_up: { ip: { limit: 10, windowSeconds: 3600 }, email: { limit: 3, windowSeconds: 3600 } },
  password_reset: { ip: { limit: 5, windowSeconds: 3600 }, email: { limit: 3, windowSeconds: 3600 } },
};

type Bucket = { limit: number; windowSeconds: number };

// Keys are hashed so the table never holds a raw email or IP address.
const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

// The client's address: first entry of x-forwarded-for (set by the host's
// proxy; later entries are intermediaries), else x-real-ip.
async function callerAddress(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}

// Leaves one security event in the audit log (FR-ADM-10) the first time a
// bucket blocks within its window, using the limiter itself as the gate so a
// sustained attack can't flood the log. Never throws: a failed log write must
// not change whether the attempt is blocked.
async function recordBlock(admin: ReturnType<typeof createAdminClient>, action: RateLimitedAction, scope: string, bucket: Bucket & { key: string }) {
  try {
    const first = await checkRateLimit(admin, { key: `audit:${bucket.key}`, limit: 1, windowSeconds: bucket.windowSeconds });
    if (!first) return;
    await recordAuditEvent(admin, {
      action: "security.rate_limited",
      entity: "auth",
      details: { attempt: action, scope, limit: bucket.limit, window_seconds: bucket.windowSeconds },
    });
  } catch (error) {
    console.error("could not record rate-limit event:", error instanceof Error ? error.name : "unknown error");
  }
}

// True when this attempt should be refused. Every call counts as an attempt.
// If the counter itself is down this lets the attempt through (and logs):
// locking everyone out of signing in is worse than a missing limit.
export async function isRateLimited(action: RateLimitedAction, email: string): Promise<boolean> {
  try {
    const policy = POLICY[action];
    const admin = createAdminClient();
    const buckets = [
      { scope: "ip", key: `${action}:ip:${digest(await callerAddress())}`, ...policy.ip },
      { scope: "email", key: `${action}:email:${digest(email.trim().toLowerCase())}`, ...policy.email },
    ];
    for (const { scope, ...bucket } of buckets) {
      if (await checkRateLimit(admin, bucket)) continue;
      await recordBlock(admin, action, scope, bucket);
      return true;
    }
    return false;
  } catch (error) {
    console.error("rate limit check failed:", error instanceof Error ? error.name : "unknown error");
    return false;
  }
}
