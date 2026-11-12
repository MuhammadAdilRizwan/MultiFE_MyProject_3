import { describe, expect, it } from "vitest";
import { getMyCustomer } from "./getMyCustomer";
import { hasDraftConsent, recordConsent } from "./recordConsent";
import { saveAgentMeasurements } from "./saveAgentMeasurements";
import { summariseActivity } from "./summariseActivity";
import type { AnySupabaseClient } from "./types";
import { bookVisit, cancelVisit, listMyVisits, recordVisitMeasurements } from "./visits";

// The agent modules are thin wrappers over SECURITY DEFINER functions (whose
// own behaviour is covered against the database); these check what each one
// sends and that database errors come back untouched.

function rpcClient(result: { data?: unknown; error?: unknown } = {}) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    },
  } as unknown as AnySupabaseClient;
  return { client, calls };
}

function queryClient(result: { data?: unknown; error?: unknown }) {
  const calls: { op: string; args: unknown[] }[] = [];
  const value = { data: result.data ?? null, error: result.error ?? null };
  const builder: Record<string, unknown> = {};
  for (const op of ["select", "eq", "order", "limit"]) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  }
  builder.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(value).then(ok, bad);
  const client = {
    from: (table: string) => {
      calls.push({ op: "from", args: [table] });
      return builder;
    },
  } as unknown as AnySupabaseClient;
  return { client, calls };
}

describe("recordConsent", () => {
  it("calls fn_agent_record_consent with the draft and method", async () => {
    const { client, calls } = rpcClient({ data: { id: "c1" } });
    await expect(recordConsent(client, { draftId: "d1", method: "in_person" })).resolves.toEqual({ id: "c1" });
    expect(calls).toEqual([{ fn: "fn_agent_record_consent", args: { p_draft_id: "d1", p_method: "in_person" } }]);
  });

  it("throws the database's error", async () => {
    const { client } = rpcClient({ error: { message: "Not allowed" } });
    await expect(recordConsent(client, { draftId: "d1", method: "in_person" })).rejects.toMatchObject({ message: "Not allowed" });
  });
});

describe("hasDraftConsent", () => {
  it("looks for this draft's agent-on-behalf consent", async () => {
    const { client, calls } = queryClient({ data: [{ id: "c1" }] });
    await expect(hasDraftConsent(client, "d1")).resolves.toBe(true);
    expect(calls).toContainEqual({ op: "from", args: ["order_consents"] });
    expect(calls).toContainEqual({ op: "eq", args: ["consent_type", "agent_on_behalf"] });
    expect(calls).toContainEqual({ op: "eq", args: ["evidence->>draft_id", "d1"] });
  });

  it("is false when there is none", async () => {
    const { client } = queryClient({ data: [] });
    await expect(hasDraftConsent(client, "d1")).resolves.toBe(false);
  });
});

describe("saveAgentMeasurements", () => {
  it("calls fn_agent_save_measurements", async () => {
    const { client, calls } = rpcClient({ data: { id: "p1" } });
    await saveAgentMeasurements(client, { draftId: "d1", values: { chest: 96 } });
    expect(calls).toEqual([{ fn: "fn_agent_save_measurements", args: { p_draft_id: "d1", p_values: { chest: 96 } } }]);
  });

  it("throws the database's error (no consent yet)", async () => {
    const { client } = rpcClient({ error: { message: "Record the customer's consent first" } });
    await expect(saveAgentMeasurements(client, { draftId: "d1", values: { chest: 96 } })).rejects.toMatchObject({
      message: "Record the customer's consent first",
    });
  });
});

describe("visits", () => {
  it("books a visit", async () => {
    const { client, calls } = rpcClient({ data: { id: "v1" } });
    await bookVisit(client, { customerId: "c1", scheduledFor: "2026-11-20T10:00:00.000Z", address: "House 1, Lahore" });
    expect(calls).toEqual([
      {
        fn: "fn_agent_book_visit",
        args: { p_customer_id: "c1", p_scheduled_for: "2026-11-20T10:00:00.000Z", p_address: "House 1, Lahore", p_notes: null },
      },
    ]);
  });

  it("records a visit's measurements", async () => {
    const { client, calls } = rpcClient({ data: { id: "v1", status: "completed" } });
    await recordVisitMeasurements(client, { visitId: "v1", values: { chest: 96 } });
    expect(calls).toEqual([{ fn: "fn_agent_record_visit_measurements", args: { p_visit_id: "v1", p_values: { chest: 96 } } }]);
  });

  it("cancels a visit", async () => {
    const { client, calls } = rpcClient({ data: { id: "v1", status: "cancelled" } });
    await cancelVisit(client, "v1");
    expect(calls).toEqual([{ fn: "fn_agent_cancel_visit", args: { p_visit_id: "v1" } }]);
  });

  it("lists the agent's own visits, soonest first", async () => {
    const { client, calls } = queryClient({ data: [{ id: "v1" }] });
    await expect(listMyVisits(client, "agent-profile-1")).resolves.toEqual([{ id: "v1" }]);
    expect(calls).toContainEqual({ op: "from", args: ["measurement_visits"] });
    expect(calls).toContainEqual({ op: "eq", args: ["agent_id", "agent-profile-1"] });
    expect(calls).toContainEqual({ op: "order", args: ["scheduled_for", { ascending: true }] });
  });
});

describe("summariseActivity", () => {
  it("counts orders by stage and totals the value of live orders", () => {
    expect(
      summariseActivity([
        { status: "placed", total: 10000 },
        { status: "in_stitching", total: 12000 },
        { status: "dispatched", total: 8000 },
        { status: "delivered", total: 9000.5 },
        { status: "cancelled", total: 7000 },
      ]),
    ).toEqual({ placed: 5, inProduction: 2, delivered: 1, cancelled: 1, activeValue: 39000.5 });
  });

  it("is all zero with no orders", () => {
    expect(summariseActivity([])).toEqual({ placed: 0, inProduction: 0, delivered: 0, cancelled: 0, activeValue: 0 });
  });
});

describe("getMyCustomer", () => {
  function singleClient(result: { data?: unknown; error?: unknown }) {
    const calls: unknown[][] = [];
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = (...args: unknown[]) => {
      calls.push(args);
      return builder;
    };
    builder.maybeSingle = () => Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    return { client: { from: () => builder } as unknown as AnySupabaseClient, calls };
  }

  it("returns the assigned customer, scoped to this agent", async () => {
    const { client, calls } = singleClient({ data: { customer_id: "c1", customer: { full_name: "Sana", phone: "923001234567" } } });
    await expect(getMyCustomer(client, "agent-1", "c1")).resolves.toEqual({ customerId: "c1", fullName: "Sana", phone: "923001234567" });
    expect(calls).toEqual([["agent_id", "agent-1"], ["customer_id", "c1"]]);
  });

  it("is null for a customer who isn't theirs", async () => {
    const { client } = singleClient({ data: null });
    await expect(getMyCustomer(client, "agent-1", "c2")).resolves.toBeNull();
  });
});
