import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/notifications", () => ({ sendQueuedEmails: vi.fn() }));

import { sendQueuedEmails } from "@/lib/notifications";
import { GET } from "./route";

const call = (auth?: string) =>
  GET(new NextRequest("http://localhost/api/cron/notifications", { headers: auth ? { authorization: auth } : {} }));

describe("GET /api/cron/notifications", () => {
  beforeEach(() => {
    vi.mocked(sendQueuedEmails).mockReset();
    vi.stubEnv("CRON_SECRET", "s3cret-value");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is off while CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(503);
    expect(sendQueuedEmails).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong-value!")).status).toBe(401);
    expect(sendQueuedEmails).not.toHaveBeenCalled();
  });

  it("sends a batch with the right secret", async () => {
    vi.mocked(sendQueuedEmails).mockResolvedValue({ configured: true, claimed: 2, sent: 2, failed: 0 });
    const res = await call("Bearer s3cret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, configured: true, claimed: 2, sent: 2, failed: 0 });
    expect(sendQueuedEmails).toHaveBeenCalledWith(50);
  });
});
