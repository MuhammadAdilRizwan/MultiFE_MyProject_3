// Auth rate limiting (security review #4): fn_rate_limit_check is the counter
// behind the sign-in / sign-up / password-reset limits. Service role only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupAll, createUserWithRole, signedInClient, uniqueSlug, anonClient } from "./support";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("fn_rate_limit_check", () => {
  let customer: Awaited<ReturnType<typeof createUserWithRole>>;
  const keys: string[] = [];
  const newKey = (tag: string) => {
    const key = uniqueSlug(`rl-${tag}`);
    keys.push(key);
    return key;
  };

  beforeAll(async () => {
    customer = await createUserWithRole("customer", "rl-customer");
  }, 30000);

  afterAll(async () => {
    for (const key of keys) await admin.from("rate_limit_hits").delete().eq("key", key);
    await cleanupAll();
  });

  const check = (key: string, limit: number, window: string) =>
    admin.rpc("fn_rate_limit_check", { p_key: key, p_limit: limit, p_window: window });

  it("allows up to the limit, then refuses", async () => {
    const key = newKey("limit");
    for (let i = 0; i < 3; i++) {
      const { data, error } = await check(key, 3, "10 minutes");
      expect(error).toBeNull();
      expect(data).toBe(true);
    }
    const blocked = await check(key, 3, "10 minutes");
    expect(blocked.error).toBeNull();
    expect(blocked.data).toBe(false);
  });

  it("counts each key separately", async () => {
    const a = newKey("a");
    const b = newKey("b");
    expect((await check(a, 1, "10 minutes")).data).toBe(true);
    expect((await check(a, 1, "10 minutes")).data).toBe(false);
    expect((await check(b, 1, "10 minutes")).data).toBe(true);
  });

  it("lets the caller back in once the window has passed", async () => {
    const key = newKey("window");
    expect((await check(key, 1, "2 seconds")).data).toBe(true);
    expect((await check(key, 1, "2 seconds")).data).toBe(false);
    await sleep(2300);
    expect((await check(key, 1, "2 seconds")).data).toBe(true);
  });

  it("rejects a nonsensical limit", async () => {
    const { error } = await check(newKey("bad"), 0, "10 minutes");
    expect(error?.code).toBe("22023");
  });

  it("is not callable by a signed-in user or an anonymous visitor", async () => {
    const signedIn = await signedInClient(customer);
    const asUser = await signedIn.rpc("fn_rate_limit_check", { p_key: newKey("user"), p_limit: 5, p_window: "1 minute" });
    expect(asUser.error?.code).toBe("42501");

    const asAnon = await anonClient().rpc("fn_rate_limit_check", { p_key: newKey("anon"), p_limit: 5, p_window: "1 minute" });
    expect(asAnon.error?.code).toBe("42501");
  });

  it("keeps the hit table private from signed-in users", async () => {
    const key = newKey("private");
    await check(key, 5, "10 minutes");

    const signedIn = await signedInClient(customer);
    const read = await signedIn.from("rate_limit_hits").select("key").eq("key", key);
    expect(read.data ?? []).toEqual([]);

    const write = await signedIn.from("rate_limit_hits").insert({ key });
    expect(write.error).not.toBeNull();
  });
});
