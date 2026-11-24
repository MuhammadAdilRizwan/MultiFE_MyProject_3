import { describe, expect, it, vi } from "vitest";
import {
  completeAccountDeletion,
  countPendingDeletionRequests,
  declineAccountDeletion,
  getMyDeletionState,
  listDeletionRequests,
  requestAccountDeletion,
  withdrawAccountDeletion,
} from "./accountDeletion";
import type { AnySupabaseClient } from "./types";

type Result = { data?: unknown; error?: unknown; count?: number | null };

// A query builder that records calls and resolves to the next queued result
// for its table (awaitable at any point, like supabase-js).
function fakeClient(byTable: Record<string, Result[]>, rpcResults: Result[] = []) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const rpc = vi.fn(() => Promise.resolve({ data: null, error: null, ...rpcResults.shift() }));
  const client = {
    from(table: string) {
      const result = { data: null, error: null, count: null, ...byTable[table]?.shift() };
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "eq", "neq", "not", "order", "limit"]) {
        builder[op] = (...args: unknown[]) => {
          calls.push({ table, op, args });
          return builder;
        };
      }
      builder.maybeSingle = () => Promise.resolve(result);
      builder.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject);
      return builder;
    },
    rpc,
  } as unknown as AnySupabaseClient;
  return { client, calls, rpc };
}

const pendingRow = {
  id: "r1",
  status: "pending",
  reason: "Not using it",
  requested_at: "2026-11-20T10:00:00Z",
  resolved_at: null,
  admin_note: null,
};

describe("getMyDeletionState", () => {
  it("returns the latest request and the open order count, for this user only", async () => {
    const { client, calls } = fakeClient({ account_deletion_requests: [{ data: pendingRow }], orders: [{ count: 2 }] });
    expect(await getMyDeletionState(client, "u1")).toEqual({
      request: {
        id: "r1",
        status: "pending",
        reason: "Not using it",
        requestedAt: "2026-11-20T10:00:00Z",
        resolvedAt: null,
        adminNote: null,
      },
      openOrders: 2,
    });
    expect(calls).toContainEqual({ table: "account_deletion_requests", op: "eq", args: ["user_id", "u1"] });
    expect(calls).toContainEqual({ table: "orders", op: "eq", args: ["customer_id", "u1"] });
    expect(calls).toContainEqual({ table: "orders", op: "not", args: ["status", "in", "(delivered,cancelled,failed)"] });
  });

  it("treats a withdrawn request as none", async () => {
    const { client } = fakeClient({
      account_deletion_requests: [{ data: { ...pendingRow, status: "withdrawn" } }],
      orders: [{ count: 0 }],
    });
    expect(await getMyDeletionState(client, "u1")).toEqual({ request: null, openOrders: 0 });
  });

  it("throws database errors", async () => {
    const { client } = fakeClient({ account_deletion_requests: [{ error: new Error("boom") }], orders: [{ count: 0 }] });
    await expect(getMyDeletionState(client, "u1")).rejects.toThrow("boom");
  });
});

describe("customer request and withdraw", () => {
  it("passes the reason (or null) to the function", async () => {
    const { client, rpc } = fakeClient({}, [{ data: "r1" }, { data: "r2" }]);
    expect(await requestAccountDeletion(client, { reason: "Moving abroad" })).toBe("r1");
    expect(rpc).toHaveBeenCalledWith("fn_request_account_deletion", { p_reason: "Moving abroad" });
    await requestAccountDeletion(client, {});
    expect(rpc).toHaveBeenLastCalledWith("fn_request_account_deletion", { p_reason: null });
  });

  it("withdraws and reports whether there was a request", async () => {
    const { client, rpc } = fakeClient({}, [{ data: true }, { data: false }]);
    expect(await withdrawAccountDeletion(client)).toBe(true);
    expect(await withdrawAccountDeletion(client)).toBe(false);
    expect(rpc).toHaveBeenCalledWith("fn_withdraw_account_deletion");
  });

  it("throws function errors", async () => {
    const { client } = fakeClient({}, [{ error: { message: "Not allowed" } }]);
    await expect(requestAccountDeletion(client, {})).rejects.toMatchObject({ message: "Not allowed" });
  });
});

describe("listDeletionRequests", () => {
  const person = { full_name: "Sana Khan", email: "sana@x.test", phone: "+923001234567" };

  it("returns pending requests with open order counts, and recent resolved ones", async () => {
    const { client, rpc } = fakeClient(
      {
        account_deletion_requests: [
          { data: [{ ...pendingRow, user_id: "u1", person }] },
          { data: [{ ...pendingRow, id: "r0", status: "completed", resolved_at: "2026-11-21T00:00:00Z", user_id: "u2", person: null }] },
        ],
      },
      [{ data: [{ user_id: "u1", open_orders: 1 }] }],
    );
    const result = await listDeletionRequests(client);
    expect(result.pending).toEqual([
      expect.objectContaining({ id: "r1", userId: "u1", name: "Sana Khan", email: "sana@x.test", openOrders: 1 }),
    ]);
    expect(result.recent).toEqual([expect.objectContaining({ id: "r0", status: "completed", name: null, openOrders: 0 })]);
    expect(rpc).toHaveBeenCalledWith("fn_admin_open_order_counts", { p_user_ids: ["u1"] });
  });

  it("skips the count lookup when nothing is pending", async () => {
    const { client, rpc } = fakeClient({ account_deletion_requests: [{ data: [] }, { data: [] }] });
    expect(await listDeletionRequests(client)).toEqual({ pending: [], recent: [] });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("admin actions", () => {
  it("counts pending requests", async () => {
    const { client, calls } = fakeClient({ account_deletion_requests: [{ count: 3 }] });
    expect(await countPendingDeletionRequests(client)).toBe(3);
    expect(calls).toContainEqual({ table: "account_deletion_requests", op: "eq", args: ["status", "pending"] });
  });

  it("completes a request and reports the orders kept", async () => {
    const { client, rpc } = fakeClient({}, [{ data: { orders_kept: 4 } }]);
    expect(await completeAccountDeletion(client, { requestId: "r1" })).toEqual({ ordersKept: 4 });
    expect(rpc).toHaveBeenCalledWith("fn_admin_complete_account_deletion", { p_request_id: "r1" });
  });

  it("declines with a note; errors are thrown", async () => {
    const { client, rpc } = fakeClient({}, [{}, { error: { message: "This request is no longer open" } }]);
    await declineAccountDeletion(client, { requestId: "r1", note: "Open dispute" });
    expect(rpc).toHaveBeenCalledWith("fn_admin_decline_account_deletion", { p_request_id: "r1", p_note: "Open dispute" });
    await expect(declineAccountDeletion(client, { requestId: "r1", note: "x" })).rejects.toMatchObject({
      message: "This request is no longer open",
    });
  });
});
