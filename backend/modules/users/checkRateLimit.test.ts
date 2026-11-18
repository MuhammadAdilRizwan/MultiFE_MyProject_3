import { describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./checkRateLimit";
import type { AnySupabaseClient } from "./types";

function clientWith(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as AnySupabaseClient, rpc };
}

describe("checkRateLimit", () => {
  it("asks the database to count this attempt against the key, limit and window", async () => {
    const { client, rpc } = clientWith({ data: true, error: null });

    await checkRateLimit(client, { key: "sign_in:email:abc", limit: 8, windowSeconds: 600 });

    expect(rpc).toHaveBeenCalledWith("fn_rate_limit_check", {
      p_key: "sign_in:email:abc",
      p_limit: 8,
      p_window: "600 seconds",
    });
  });

  it("returns true when the attempt is allowed", async () => {
    const { client } = clientWith({ data: true, error: null });
    await expect(checkRateLimit(client, { key: "k", limit: 1, windowSeconds: 60 })).resolves.toBe(true);
  });

  it("returns false when the limit has been reached", async () => {
    const { client } = clientWith({ data: false, error: null });
    await expect(checkRateLimit(client, { key: "k", limit: 1, windowSeconds: 60 })).resolves.toBe(false);
  });

  it("throws when the database call fails, so the caller decides what to do", async () => {
    const { client } = clientWith({ data: null, error: { message: "db down" } });
    await expect(checkRateLimit(client, { key: "k", limit: 1, windowSeconds: 60 })).rejects.toMatchObject({ message: "db down" });
  });
});
