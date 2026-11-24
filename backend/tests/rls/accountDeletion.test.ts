import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { adminCancelOrder } from "../../modules/orders/adminOrders";
import {
  completeAccountDeletion,
  declineAccountDeletion,
  getMyDeletionState,
  listDeletionRequests,
  requestAccountDeletion,
  withdrawAccountDeletion,
} from "../../modules/users/accountDeletion";
import { setAccountStatus, setUserRole } from "../../modules/users/adminUsers";
import { admin, anonClient, cleanupAll, createOrderInProduction, createUserWithRole, signedInClient } from "./support";

// Migration 20261124100000 on real sessions (FR-AUTH-09): a customer asks,
// withdraws, is declined, asks again; an admin can't delete while an order is
// in progress, then deletes: sign-in gone, profile anonymised, measurement
// sets and drafts deleted, the order kept without the delivery contact, and
// the account can never be reactivated. Every step is audited.

describe("account deletion", () => {
  let adminClient: SupabaseClient;
  let customer: SupabaseClient;
  let stranger: SupabaseClient;
  let tailor: SupabaseClient;
  let customerId: string;
  let customerLogin: { email: string; password: string };
  let order: Awaited<ReturnType<typeof createOrderInProduction>>;

  const audits = async (entityId: string) =>
    ((await admin.from("audit_log").select("action").eq("entity_id", entityId).order("created_at")).data ?? []).map(
      (r) => (r as { action: string }).action,
    );
  const pendingId = async () =>
    ((await admin.from("account_deletion_requests").select("id").eq("user_id", customerId).eq("status", "pending").single()).data as {
      id: string;
    }).id;

  beforeAll(async () => {
    const a = await createUserWithRole("admin", "ad-admin");
    const c = await createUserWithRole("customer", "ad-cust");
    const s = await createUserWithRole("customer", "ad-stranger");
    const t = await createUserWithRole("tailor", "ad-tailor");
    customerId = c.userId;
    customerLogin = c;
    [adminClient, customer, stranger, tailor] = await Promise.all([signedInClient(a), signedInClient(c), signedInClient(s), signedInClient(t)]);

    // An order in progress for our customer, with a delivery contact on it.
    order = await createOrderInProduction("ad-order");
    const { error } = await admin
      .from("orders")
      .update({
        customer_id: customerId,
        delivery_address: { method: "delivery", full_name: "Ad Cust", phone: "+923001234567", address_line: "House 4, Street 9", city: "Lahore" },
      })
      .eq("id", order.orderId);
    if (error) throw error;
    await admin.from("profiles").update({ phone: "+923001234567", delivery_address: { address_line: "House 4, Street 9", city: "Lahore" } }).eq("id", customerId);
    await admin.from("measurement_profiles").insert({ customer_id: customerId, measurement_values: { bust: 90 } });
    await admin.from("order_drafts").insert({ customer_id: customerId, options: {} });
  }, 90000);

  afterAll(async () => {
    await admin.from("audit_log").delete().eq("entity_id", customerId);
    await admin.from("account_deletion_requests").delete().eq("user_id", customerId);
    await cleanupAll();
    // The deleted customer's auth user is marked deleted, which Supabase's
    // admin API may no longer find: remove it directly if it's still there.
    const left = await admin.from("profiles").select("id").eq("id", customerId).maybeSingle();
    if (left.data && process.env.DATABASE_URL) {
      const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
      await db.connect();
      await db.query("delete from auth.users where id = $1", [customerId]);
      await db.end();
    }
  }, 60000);

  it("a customer asks once (asking again keeps the same request) and sees it", async () => {
    const id = await requestAccountDeletion(customer, { reason: "  Moving abroad " });
    expect(await requestAccountDeletion(customer, { reason: "again" })).toBe(id);
    const state = await getMyDeletionState(customer, customerId);
    expect(state).toMatchObject({ request: { id, status: "pending", reason: "Moving abroad" }, openOrders: 1 });
    expect(await audits(customerId)).toContain("user.deletion_requested");
  });

  it("nobody else can read it, and nobody can write requests directly", async () => {
    expect((await stranger.from("account_deletion_requests").select("id").eq("user_id", customerId)).data).toEqual([]);
    expect((await anonClient().from("account_deletion_requests").select("id")).data ?? []).toEqual([]);
    await anonClient()
      .rpc("fn_request_account_deletion", { p_reason: null })
      .then((r) => expect(r.error).toBeTruthy());
    const update = await customer.from("account_deletion_requests").update({ status: "completed" }).eq("user_id", customerId).select("id");
    expect(update.data ?? []).toEqual([]);
    const insert = await stranger.from("account_deletion_requests").insert({ user_id: customerId });
    expect(insert.error).toBeTruthy();
  });

  it("a customer can't mark themself deleted, and staff can't ask", async () => {
    const r = await customer.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", customerId);
    expect(r.error?.message).toContain("fn_admin_complete_account_deletion");
    await expect(requestAccountDeletion(tailor, {})).rejects.toMatchObject({ message: "Not allowed" });
  });

  it("only an admin decides; not while an order is in progress", async () => {
    const id = await pendingId();
    await expect(completeAccountDeletion(tailor, { requestId: id })).rejects.toMatchObject({ message: "Not allowed" });
    await expect(declineAccountDeletion(stranger, { requestId: id, note: "nope" })).rejects.toMatchObject({ message: "Not allowed" });
    await expect(completeAccountDeletion(adminClient, { requestId: id })).rejects.toMatchObject({
      message: "Wait until their 1 open order(s) are delivered or cancelled",
    });
    const listed = await listDeletionRequests(adminClient);
    expect(listed.pending).toContainEqual(expect.objectContaining({ id, openOrders: 1, phone: "+923001234567" }));
    await expect(listDeletionRequests(stranger)).resolves.toMatchObject({ pending: [] });
  });

  it("withdraw, then a decline with a note the customer sees", async () => {
    expect(await withdrawAccountDeletion(customer)).toBe(true);
    expect(await withdrawAccountDeletion(customer)).toBe(false);
    expect((await getMyDeletionState(customer, customerId)).request).toBeNull();

    await requestAccountDeletion(customer, {});
    const id = await pendingId();
    await expect(declineAccountDeletion(adminClient, { requestId: id, note: " " })).rejects.toMatchObject({ message: "Tell the customer why" });
    await declineAccountDeletion(adminClient, { requestId: id, note: "Your order is still being made" });
    expect((await getMyDeletionState(customer, customerId)).request).toMatchObject({
      status: "declined",
      adminNote: "Your order is still being made",
    });
    await expect(declineAccountDeletion(adminClient, { requestId: id, note: "again" })).rejects.toMatchObject({
      message: "This request is no longer open",
    });
    expect(await audits(customerId)).toEqual(
      expect.arrayContaining(["user.deletion_withdrawn", "user.deletion_declined"]),
    );
  });

  it("once the order is closed, the admin deletes: the person goes, the order stays", async () => {
    await requestAccountDeletion(customer, { reason: "Please delete" });
    const id = await pendingId();
    await adminCancelOrder(adminClient, { orderId: order.orderId, reason: "Customer asked" });

    expect(await completeAccountDeletion(adminClient, { requestId: id })).toEqual({ ordersKept: 1 });

    const profile = (await admin.from("profiles").select("full_name, email, phone, delivery_address, status, deleted_at").eq("id", customerId).single())
      .data as Record<string, unknown>;
    expect(profile).toMatchObject({ full_name: "Deleted customer", email: null, phone: null, delivery_address: null, status: "suspended" });
    expect(profile.deleted_at).toBeTruthy();

    expect((await admin.from("measurement_profiles").select("id").eq("customer_id", customerId)).data).toEqual([]);
    expect((await admin.from("order_drafts").select("id").eq("customer_id", customerId).neq("step", "ordered")).data).toEqual([]);

    const kept = (await admin.from("orders").select("customer_id, status, delivery_address").eq("id", order.orderId).single()).data;
    expect(kept).toEqual({ customer_id: customerId, status: "cancelled", delivery_address: { method: "delivery" } });

    const signIn = await anonClient().auth.signInWithPassword(customerLogin);
    expect(signIn.error).toBeTruthy();
    // Supabase Auth can still load the wiped user (its admin API must keep working).
    const authUser = await admin.auth.admin.getUserById(customerId);
    expect(authUser.error).toBeNull();
    expect(authUser.data.user?.email ?? "").toBe("");

    const request = (await admin.from("account_deletion_requests").select("status, resolved_at").eq("id", id).single()).data;
    expect(request).toMatchObject({ status: "completed" });
    expect(await audits(customerId)).toContain("user.deleted");
  });

  it("a deleted account can never come back", async () => {
    await expect(setAccountStatus(adminClient, { userId: customerId, status: "active" })).rejects.toMatchObject({
      message: "This account was deleted",
    });
    await expect(setUserRole(adminClient, { userId: customerId, role: "agent", agentCode: "AG-DEL-1" })).rejects.toMatchObject({
      message: "This account was deleted",
    });
    const undo = await admin.from("profiles").update({ deleted_at: null }).eq("id", customerId);
    expect(undo.error?.message).toContain("fn_admin_complete_account_deletion");
    await expect(completeAccountDeletion(adminClient, { requestId: await lastRequestId() })).rejects.toMatchObject({
      message: "This request is no longer open",
    });
  });

  const lastRequestId = async () =>
    ((await admin.from("account_deletion_requests").select("id").eq("user_id", customerId).order("requested_at", { ascending: false }).limit(1).single())
      .data as { id: string }).id;
});
