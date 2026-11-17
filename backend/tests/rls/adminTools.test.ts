import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAgentActivity } from "../../modules/agents/agentActivity";
import { addOrderNote, adminCancelOrder } from "../../modules/orders/adminOrders";
import { setUserRole } from "../../modules/users/adminUsers";
import { admin, cleanupAll, createOrderInProduction, createUserWithRole, signedInClient } from "./support";

// Migration 20261117400000 on real sessions: role changes (FR-ADM-05), order
// notes / disputes / admin cancel (FR-ADM-06, UC-12), agent activity
// (FR-AGT-13). Every change lands in the audit log (FR-ADM-10).

describe("admin tools", () => {
  let adminClient: SupabaseClient;
  let customer: SupabaseClient;
  let adminId: string;
  let personId: string;
  let tailorId: string;
  let order: Awaited<ReturnType<typeof createOrderInProduction>>;

  const roleOf = async (id: string) => ((await admin.from("profiles").select("role").eq("id", id).single()).data as { role: string }).role;
  const audits = async (entityId: string, action: string) =>
    (await admin.from("audit_log").select("action, before, after").eq("entity_id", entityId).eq("action", action)).data ?? [];

  beforeAll(async () => {
    const a = await createUserWithRole("admin", "at-admin");
    const c = await createUserWithRole("customer", "at-cust");
    const person = await createUserWithRole("customer", "at-person");
    const tailor = await createUserWithRole("tailor", "at-tailor");
    adminId = a.userId;
    personId = person.userId;
    tailorId = tailor.userId;
    [adminClient, customer] = await Promise.all([signedInClient(a), signedInClient(c)]);
    order = await createOrderInProduction("at-order");
  }, 60000);

  afterAll(async () => {
    await cleanupAll();
  });

  it("an admin makes a customer a tailor; it's audited", async () => {
    expect(await setUserRole(adminClient, { userId: personId, role: "tailor" })).toBe("tailor");
    expect(await roleOf(personId)).toBe("tailor");
    expect(await audits(personId, "user.role_change")).toEqual([
      expect.objectContaining({ before: { role: "customer" }, after: { role: "tailor" } }),
    ]);
  });

  it("only an admin, never on themselves, and not to store contact", async () => {
    await expect(setUserRole(customer, { userId: personId, role: "admin" })).rejects.toBeTruthy();
    await expect(setUserRole(adminClient, { userId: adminId, role: "customer" })).rejects.toMatchObject({
      message: expect.stringContaining("your own role"),
    });
    await expect(
      admin.rpc("fn_admin_set_role", { p_user_id: personId, p_role: "supplier_contact" }).then((r) => {
        if (r.error) throw r.error;
      }),
    ).rejects.toBeTruthy();
  });

  it("an agent needs a unique code; leaving the role suspends the agent row", async () => {
    await expect(setUserRole(adminClient, { userId: personId, role: "agent" })).rejects.toMatchObject({
      message: expect.stringContaining("code"),
    });
    const code = `AT-${Date.now().toString().slice(-6)}`;
    await setUserRole(adminClient, { userId: personId, role: "agent", agentCode: code.toLowerCase() });
    const agent = await admin.from("agents").select("code, status").eq("profile_id", personId).single();
    expect(agent.data).toEqual({ code, status: "active" });

    await setUserRole(adminClient, { userId: personId, role: "customer" });
    expect((await admin.from("agents").select("status").eq("profile_id", personId).single()).data?.status).toBe("suspended");
  });

  it("suspending a tailor hands their open jobs to another tailor (20261117510000)", async () => {
    const other = await createUserWithRole("tailor", "at-tailor-b");
    await admin.from("production_jobs").update({ assigned_to_id: tailorId }).eq("id", order.jobId);
    const suspended = await adminClient.rpc("fn_admin_set_account_status", { p_user_id: tailorId, p_status: "suspended", p_reason: "On leave" });
    expect(suspended.error).toBeNull();
    const job = await admin.from("production_jobs").select("assigned_to_id").eq("id", order.jobId).single();
    expect(job.data?.assigned_to_id).not.toBe(tailorId);
    expect(job.data?.assigned_to_id).not.toBeNull();
    expect(other.userId).toBeTruthy();
    await adminClient.rpc("fn_admin_set_account_status", { p_user_id: tailorId, p_status: "active" });
  });

  it("a tailor with open jobs can't be moved until they're reassigned", async () => {
    await admin.from("production_jobs").update({ assigned_to_id: tailorId }).eq("id", order.jobId);
    await expect(setUserRole(adminClient, { userId: tailorId, role: "customer" })).rejects.toMatchObject({
      message: expect.stringContaining("open job"),
    });
    await admin.from("production_jobs").update({ assigned_to_id: null }).eq("id", order.jobId);
    expect(await setUserRole(adminClient, { userId: tailorId, role: "qc" })).toBe("qc");
  });

  it("notes and disputes: admin only, one open dispute at a time, all audited", async () => {
    await expect(addOrderNote(customer, { orderId: order.orderId, kind: "note", body: "Hello" })).rejects.toBeTruthy();
    await addOrderNote(adminClient, { orderId: order.orderId, kind: "note", body: "Called the customer" });
    await expect(addOrderNote(adminClient, { orderId: order.orderId, kind: "dispute_resolved", body: "Done" })).rejects.toMatchObject({
      message: expect.stringContaining("no open dispute"),
    });
    await addOrderNote(adminClient, { orderId: order.orderId, kind: "dispute_opened", body: "Customer says the sleeve is short" });
    let state = await admin.from("orders").select("dispute_opened_at").eq("id", order.orderId).single();
    expect(state.data?.dispute_opened_at).not.toBeNull();
    await expect(addOrderNote(adminClient, { orderId: order.orderId, kind: "dispute_opened", body: "Again" })).rejects.toBeTruthy();
    await addOrderNote(adminClient, { orderId: order.orderId, kind: "dispute_resolved", body: "Agreed a free alteration" });
    state = await admin.from("orders").select("dispute_opened_at").eq("id", order.orderId).single();
    expect(state.data?.dispute_opened_at).toBeNull();

    expect((await customer.from("order_notes").select("id").eq("order_id", order.orderId)).data).toEqual([]);
    expect((await adminClient.from("order_notes").select("id").eq("order_id", order.orderId)).data).toHaveLength(3);
    const actions = ((await admin.from("audit_log").select("action").eq("entity_id", order.orderId)).data ?? []).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["order.note", "order.dispute_open", "order.dispute_resolve"]));
  });

  it("an admin cancels with a reason; the paid order gets a refund record", async () => {
    await expect(adminCancelOrder(adminClient, { orderId: order.orderId, reason: "" })).rejects.toBeTruthy();
    const result = await adminCancelOrder(adminClient, { orderId: order.orderId, reason: "Customer changed their mind" });
    expect(result).toEqual({ status: "cancelled", payment_status: "refund_pending" });
    const refund = await admin.from("payments").select("kind, status").eq("order_id", order.orderId).eq("kind", "refund");
    expect(refund.data).toEqual([{ kind: "refund", status: "pending" }]);
  });

  it("agent activity is admin-only", async () => {
    expect(Array.isArray(await getAgentActivity(adminClient))).toBe(true);
    await expect(getAgentActivity(customer)).rejects.toBeTruthy();
  });

  it("only admins can read the audit log", async () => {
    expect((await customer.from("audit_log").select("id").limit(1)).data).toEqual([]);
    expect(((await adminClient.from("audit_log").select("id").limit(1)).data ?? []).length).toBe(1);
  });
});
