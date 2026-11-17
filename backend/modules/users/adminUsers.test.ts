import { describe, expect, it, vi } from "vitest";
import { USERS_PAGE_SIZE, cleanSearch, listUsers, setAccountStatus, setUserRole } from "./adminUsers";
import type { AnySupabaseClient } from "./types";

function fakeClient(result: { data: unknown; error: unknown; count?: number }) {
  const calls: { op: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const op of ["select", "order", "range", "eq", "or"]) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  }
  builder.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, err);
  const client = {
    from: (table: string) => (calls.push({ op: "from", args: [table] }), builder),
    rpc: (fn: string, args: unknown) => (calls.push({ op: `rpc:${fn}`, args: [args] }), Promise.resolve(result)),
  } as unknown as AnySupabaseClient;
  return { client, calls };
}

describe("cleanSearch", () => {
  it("keeps names, emails and phones but drops filter syntax", () => {
    expect(cleanSearch("  Sana Khan ")).toBe("Sana Khan");
    expect(cleanSearch("sana@x.pk")).toBe("sana@x.pk");
    expect(cleanSearch("+92 300")).toBe("+92 300");
    // Commas and parentheses would start a new or() condition.
    expect(cleanSearch("a,role.eq.admin)")).toBe("arole.eq.admin");
    expect(cleanSearch("%*()")).toBe("");
    expect(cleanSearch(undefined)).toBe("");
  });
});

describe("listUsers", () => {
  it("pages newest first with an exact count", async () => {
    const { client, calls } = fakeClient({ data: [{ id: "u1" }], error: null, count: 40 });
    expect(await listUsers(client, { page: 2 })).toEqual({ users: [{ id: "u1" }], total: 40 });
    expect(calls).toContainEqual({ op: "from", args: ["profiles"] });
    expect(calls).toContainEqual({ op: "order", args: ["created_at", { ascending: false }] });
    expect(calls).toContainEqual({ op: "range", args: [USERS_PAGE_SIZE, 2 * USERS_PAGE_SIZE - 1] });
    expect(calls.some((c) => c.op === "or" || c.op === "eq")).toBe(false);
  });

  it("filters by role, status and a search over name, email and phone", async () => {
    const { client, calls } = fakeClient({ data: [], error: null, count: 0 });
    await listUsers(client, { role: "agent", status: "suspended", query: "0300 12" });
    expect(calls).toContainEqual({ op: "eq", args: ["role", "agent"] });
    expect(calls).toContainEqual({ op: "eq", args: ["status", "suspended"] });
    expect(calls).toContainEqual({ op: "or", args: ["full_name.ilike.%0300 12%,email.ilike.%0300 12%,phone.ilike.%30012%"] });
  });

  it("throws database errors", async () => {
    await expect(listUsers(fakeClient({ data: null, error: { message: "boom" } }).client)).rejects.toMatchObject({ message: "boom" });
  });
});

describe("setAccountStatus", () => {
  it("goes through fn_admin_set_account_status", async () => {
    const { client, calls } = fakeClient({ data: "suspended", error: null });
    expect(await setAccountStatus(client, { userId: "u1", status: "suspended", reason: "Fake orders" })).toBe("suspended");
    expect(calls).toContainEqual({
      op: "rpc:fn_admin_set_account_status",
      args: [{ p_user_id: "u1", p_status: "suspended", p_reason: "Fake orders" }],
    });
  });

  it("throws the database's refusal", async () => {
    const { client } = fakeClient({ data: null, error: { message: "You cannot change your own account status" } });
    await expect(setAccountStatus(client, { userId: "me", status: "suspended", reason: "x" })).rejects.toMatchObject({
      message: "You cannot change your own account status",
    });
  });
});

describe("setUserRole", () => {
  it("calls fn_admin_set_role with the agent code when given", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "agent", error: null });
    const supabase = { rpc } as unknown as Parameters<typeof setUserRole>[0];
    expect(await setUserRole(supabase, { userId: "u1", role: "agent", agentCode: "AG-012" })).toBe("agent");
    expect(rpc).toHaveBeenCalledWith("fn_admin_set_role", { p_user_id: "u1", p_role: "agent", p_agent_code: "AG-012" });
    await setUserRole(supabase, { userId: "u1", role: "tailor" });
    expect(rpc).toHaveBeenLastCalledWith("fn_admin_set_role", { p_user_id: "u1", p_role: "tailor", p_agent_code: null });
  });

  it("passes the database's refusal through", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("Reassign their 2 open job(s) first") });
    const supabase = { rpc } as unknown as Parameters<typeof setUserRole>[0];
    await expect(setUserRole(supabase, { userId: "u1", role: "customer" })).rejects.toThrow("open job");
  });
});
