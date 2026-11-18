import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markCollected, markReadyForCollection } from "../../modules/orders/collection";
import { dispatchOrder } from "../../modules/orders/delivery";
import { retryNotification } from "../../modules/notifications/dispatchNotifications";
import { advanceStage } from "../../modules/production/advanceStage";
import { approveForProduction } from "../../modules/production/approveForProduction";
import { assignProductionJob } from "../../modules/production/assignProductionJob";
import { getCorrectionThreshold, requestMeasurementCorrection, respondMeasurementCorrection } from "../../modules/production/measurementCorrections";
import { recordFabricReceived } from "../../modules/production/recordFabricReceived";
import { admin, cleanupAll, createSupplier, createUserWithRole, signedInClient, uniqueSlug } from "./support";

// Migration 20261117200000 on real sessions: big measurement corrections wait
// for the customer (FR-AI-16), a collection order is handed over instead of
// shipped (FR-FUL-06), and the email queue's retry bookkeeping (FR-NOT-03).

const FIELDS = [
  { key: "chest", label: "Chest", unit: "cm", min: 75, max: 135 },
  { key: "waist", label: "Waist", unit: "cm", min: 60, max: 125 },
];
const CONFIRMED = { chest: 90, waist: 72 };

describe("corrections, collection and the email queue", () => {
  let adminClient: SupabaseClient;
  let tailor: SupabaseClient;
  let qc: SupabaseClient;
  let dispatcher: SupabaseClient;
  let customer: SupabaseClient;
  let stranger: SupabaseClient;
  let tailorId: string;
  let qcId: string;
  let orderId: string;
  let jobId: string;
  const created: { table: string; id: string }[] = [];

  const orderStatus = async () =>
    ((await admin.from("orders").select("status").eq("id", orderId).single()).data as { status: string }).status;
  const outbox = async (template: string) =>
    (await admin.from("notification_outbox").select("id, channel, status").eq("order_id", orderId).eq("template", template)).data ?? [];

  beforeAll(async () => {
    const [a, t, q, d, c, s] = await Promise.all([
      createUserWithRole("admin", "cc-admin"),
      createUserWithRole("tailor", "cc-tailor"),
      createUserWithRole("qc", "cc-qc"),
      createUserWithRole("dispatch", "cc-dispatch"),
      createUserWithRole("customer", "cc-cust"),
      createUserWithRole("customer", "cc-stranger"),
    ]);
    tailorId = t.userId;
    qcId = q.userId;
    [adminClient, tailor, qc, dispatcher, customer, stranger] = await Promise.all([a, t, q, d, c, s].map(signedInClient));

    const supplierId = await createSupplier("cc", "active");
    const fabric = await admin
      .from("fabrics")
      .insert({ supplier_id: supplierId, external_id: uniqueSlug("ext"), name: "CC lawn", price_per_metre: 1000, stock_metres: 50 })
      .select("id")
      .single();
    if (fabric.error) throw fabric.error;
    created.push({ table: "fabrics", id: fabric.data.id });
    const template = await admin
      .from("dress_templates")
      .insert({ name: "CC kurta", slug: uniqueSlug("cc-kurta"), base_stitch_price: 500, required_measurements: FIELDS })
      .select("id")
      .single();
    if (template.error) throw template.error;
    created.push({ table: "dress_templates", id: template.data.id });

    const profile = await admin
      .from("measurement_profiles")
      .insert({ customer_id: c.userId, measurement_values: CONFIRMED, confirmed_by_id: c.userId, confirmed_by_role: "customer", confirmed_at: new Date().toISOString() })
      .select("id")
      .single();
    if (profile.error) throw profile.error;
    created.push({ table: "measurement_profiles", id: profile.data.id });
    const draft = await admin
      .from("order_drafts")
      .insert({ customer_id: c.userId, fabric_id: fabric.data.id, template_id: template.data.id, measurement_profile_id: profile.data.id })
      .select("id")
      .single();
    if (draft.error) throw draft.error;
    created.push({ table: "order_drafts", id: draft.data.id });
    await admin.from("fabric_reservations").insert({ fabric_id: fabric.data.id, order_draft_id: draft.data.id, metres: 3, kind: "hard", status: "active" });

    const order = await admin.rpc("fn_create_order_from_draft", {
      p_draft_id: draft.data.id,
      p_amount: 12000,
      p_gateway_ref: uniqueSlug("pay"),
      p_event_id: uniqueSlug("evt"),
    });
    if (order.error) throw order.error;
    orderId = (order.data as { id: string }).id;
    created.unshift({ table: "orders", id: orderId });
    await admin.from("order_items").update({ measurements: CONFIRMED }).eq("order_id", orderId);
    await admin
      .from("orders")
      .update({ delivery_address: { method: "collection", full_name: "CC Customer", phone: "+923001234567" } })
      .eq("id", orderId);
    jobId = ((await admin.from("production_jobs").select("id").eq("order_id", orderId).single()).data as { id: string }).id;

    // Placing the order already secured the fabric (20261117500000).
    await assignProductionJob(adminClient, { jobId, assignedToId: tailorId });
    await recordFabricReceived(tailor, jobId);
  }, 60000);

  afterAll(async () => {
    for (const { table, id } of created) await admin.from(table).delete().eq("id", id);
    await cleanupAll();
  });

  it("derives the collection method from the order's delivery details", async () => {
    const row = await admin.from("orders").select("fulfilment_method").eq("id", orderId).single();
    expect(row.data?.fulfilment_method).toBe("collection");
    expect(await getCorrectionThreshold(tailor)).toBe(2);
  });

  it("a big change can't be approved directly; a small one doesn't go to the customer", async () => {
    await expect(approveForProduction(tailor, { jobId, values: { chest: 95, waist: 72 }, reason: "Re-measured" })).rejects.toMatchObject({
      message: expect.stringContaining("customer's approval"),
    });
    await expect(requestMeasurementCorrection(tailor, { jobId, values: { chest: 91, waist: 72 }, reason: "Tiny" })).rejects.toMatchObject({
      message: expect.stringContaining("Small corrections"),
    });
  });

  let correctionId: string;

  it("the tailor sends the correction: the order waits and the customer is emailed", async () => {
    const correction = await requestMeasurementCorrection(tailor, { jobId, values: { chest: 95, waist: 72 }, reason: "Chest re-measured at fitting" });
    correctionId = correction.id;
    expect(correction.status).toBe("pending");
    expect(correction.original).toEqual(CONFIRMED);
    expect(await orderStatus()).toBe("received_at_hub");
    expect((await outbox("measurement_correction")).some((n) => n.channel === "email")).toBe(true);
  });

  it("only the customer (and assigned staff) can see it; only the customer can answer", async () => {
    expect((await customer.from("measurement_corrections").select("id").eq("id", correctionId)).data).toHaveLength(1);
    expect((await tailor.from("measurement_corrections").select("id").eq("id", correctionId)).data).toHaveLength(1);
    expect((await stranger.from("measurement_corrections").select("id").eq("id", correctionId)).data).toEqual([]);
    await expect(respondMeasurementCorrection(stranger, { correctionId, accept: true })).rejects.toBeTruthy();
    await expect(respondMeasurementCorrection(tailor, { correctionId, accept: true })).rejects.toBeTruthy();
  });

  it("declining needs a note and keeps the order paused", async () => {
    await expect(respondMeasurementCorrection(customer, { correctionId, accept: false })).rejects.toMatchObject({
      message: expect.stringContaining("what"),
    });
    const declined = await respondMeasurementCorrection(customer, { correctionId, accept: false, note: "My chest is 90" });
    expect(declined.status).toBe("declined");
    await expect(respondMeasurementCorrection(customer, { correctionId, accept: true })).rejects.toMatchObject({
      message: expect.stringContaining("already been answered"),
    });
    await expect(approveForProduction(tailor, { jobId, values: { chest: 95, waist: 72 } })).rejects.toBeTruthy();
  });

  it("once the customer accepts, exactly those values can be approved", async () => {
    const again = await requestMeasurementCorrection(tailor, { jobId, values: { chest: 94, waist: 72 }, reason: "Measured again" });
    const old = await admin.from("measurement_corrections").select("status").eq("id", correctionId).single();
    expect(old.data?.status).toBe("superseded");

    expect((await respondMeasurementCorrection(customer, { correctionId: again.id, accept: true })).status).toBe("accepted");
    await expect(approveForProduction(tailor, { jobId, values: { chest: 96, waist: 72 } })).rejects.toBeTruthy();
    const approved = await approveForProduction(tailor, { jobId, values: { chest: 94, waist: 72 }, reason: "Accepted by customer" });
    expect(approved.status).toBe("measurements_approved");
  });

  it("a collection order isn't shipped: dispatch marks it ready, then hands it over", async () => {
    await advanceStage(tailor, { jobId, toStage: "cutting" });
    await advanceStage(tailor, { jobId, toStage: "stitching" });
    await advanceStage(tailor, { jobId, toStage: "qc" });
    await assignProductionJob(adminClient, { jobId, assignedToId: qcId });
    await advanceStage(qc, { jobId, toStage: "passed" });
    expect(await orderStatus()).toBe("ready_to_ship");

    await expect(dispatchOrder(dispatcher, { orderId, courier: "TCS", trackingRef: "T-1" })).rejects.toMatchObject({
      message: expect.stringContaining("collection"),
    });
    await expect(markCollected(dispatcher, orderId)).rejects.toMatchObject({ message: expect.stringContaining("ready for collection") });
    await expect(markReadyForCollection(tailor, orderId)).rejects.toBeTruthy();

    expect(await markReadyForCollection(dispatcher, orderId)).toEqual({ status: "ready_for_collection" });
    expect((await outbox("ready_for_collection")).length).toBeGreaterThan(0);
    const view = await dispatcher.from("dispatch_order_view").select("fulfilment_method, shipment_status").eq("id", orderId).single();
    expect(view.data).toEqual({ fulfilment_method: "collection", shipment_status: "ready_for_collection" });

    expect(await markCollected(dispatcher, orderId)).toEqual({ status: "delivered" });
    const shipment = await admin.from("shipments").select("status, delivered_at").eq("order_id", orderId).single();
    expect(shipment.data?.status).toBe("completed");
    expect(shipment.data?.delivered_at).not.toBeNull();
  });

  it("email retries back off, fail after 5 attempts, and only an admin can retry", async () => {
    const row = await admin
      .from("notification_outbox")
      .insert({ order_id: orderId, channel: "email", recipient: "nobody@multife-test.local", template: "order_placed", attempts: 4, next_attempt_at: new Date(Date.now() + 864e5).toISOString() })
      .select("id")
      .single();
    if (row.error) throw row.error;
    const id = row.data.id;

    // Customers can't run the sender's functions.
    await expect(customer.rpc("fn_claim_notifications", { p_limit: 1 })).resolves.toMatchObject({ error: expect.anything() });
    await expect(customer.rpc("fn_finish_notification", { p_id: id, p_ok: true })).resolves.toMatchObject({ error: expect.anything() });

    await admin.rpc("fn_finish_notification", { p_id: id, p_ok: false, p_error: "Resend 500" });
    let state = (await admin.from("notification_outbox").select("status, last_error, next_attempt_at").eq("id", id).single()).data!;
    expect(state).toMatchObject({ status: "pending", last_error: "Resend 500" });
    expect(new Date(state.next_attempt_at).getTime()).toBeGreaterThan(Date.now());

    await admin.from("notification_outbox").update({ attempts: 5 }).eq("id", id);
    await admin.rpc("fn_finish_notification", { p_id: id, p_ok: false, p_error: "Resend 500" });
    state = (await admin.from("notification_outbox").select("status").eq("id", id).single()).data!;
    expect(state.status).toBe("failed");

    await expect(retryNotification(customer, id)).rejects.toBeTruthy();
    await retryNotification(adminClient, id);
    const retried = (await admin.from("notification_outbox").select("status, attempts").eq("id", id).single()).data!;
    expect(retried).toEqual({ status: "pending", attempts: 0 });

    await admin.rpc("fn_finish_notification", { p_id: id, p_ok: true });
    expect((await admin.from("notification_outbox").select("status").eq("id", id).single()).data?.status).toBe("sent");
  });
});
