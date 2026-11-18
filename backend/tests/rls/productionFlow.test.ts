import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchOrder, markDelivered, reattemptDelivery, recordDeliveryFailure } from "../../modules/orders/delivery";
import { markFabricSecured } from "../../modules/orders/markFabricSecured";
import { advanceStage } from "../../modules/production/advanceStage";
import { approveForProduction } from "../../modules/production/approveForProduction";
import { assignProductionJob } from "../../modules/production/assignProductionJob";
import { createRemake } from "../../modules/production/createRemake";
import { listProductionStaff } from "../../modules/production/listProductionStaff";
import { recordFabricReceived } from "../../modules/production/recordFabricReceived";
import { admin, cleanupAll, createSupplier, createUserWithRole, signedInClient, uniqueSlug } from "./support";

// The /production panel end to end on real sessions (migrations
// 20261117050000 + 20261117100000): admin secures the fabric and assigns, the
// assigned tailor receives, approves (with a correction) and makes; QC sends
// it back once, then for remake; the admin orders the remake; it passes and
// dispatch delivers it after one failed attempt.
// Also: only the assignee can act, staff see the job's (hidden) fabric and
// the customer's own measurements, and the cutting step uses up the stock
// without double-counting the order's hold.

const FIELDS = [
  { key: "chest", label: "Chest", unit: "cm", min: 75, max: 135 },
  { key: "waist", label: "Waist", unit: "cm", min: 60, max: 125 },
];
const CONFIRMED = { chest: 90, waist: 72 };

describe("production panel flow", () => {
  let adminClient: SupabaseClient;
  let tailor: SupabaseClient;
  let otherTailor: SupabaseClient;
  let qc: SupabaseClient;
  let dispatcher: SupabaseClient;
  let customer: SupabaseClient;
  let tailorId: string;
  let otherTailorId: string;
  let qcId: string;
  let orderId: string;
  let orderNumber: string;
  let jobId: string;
  let fabricId: string;
  let profileId: string;
  const created: { table: string; id: string }[] = [];

  const orderStatus = async () =>
    ((await admin.from("orders").select("status").eq("id", orderId).single()).data as { status: string }).status;

  beforeAll(async () => {
    const [a, t, t2, q, d] = await Promise.all([
      createUserWithRole("admin", "flow-admin"),
      createUserWithRole("tailor", "flow-tailor"),
      createUserWithRole("tailor", "flow-tailor2"),
      createUserWithRole("qc", "flow-qc"),
      createUserWithRole("dispatch", "flow-dispatch"),
    ]);
    tailorId = t.userId;
    otherTailorId = t2.userId;
    qcId = q.userId;
    [adminClient, tailor, otherTailor, qc, dispatcher] = await Promise.all([a, t, t2, q, d].map(signedInClient));

    const supplierId = await createSupplier("flow", "active");
    // Hidden from the storefront: staff must still see it on their job.
    const fabric = await admin
      .from("fabrics")
      .insert({ supplier_id: supplierId, external_id: uniqueSlug("ext"), name: "Flow lawn", price_per_metre: 1000, stock_metres: 50, is_hidden: true })
      .select("id")
      .single();
    if (fabric.error) throw fabric.error;
    fabricId = fabric.data.id;
    created.push({ table: "fabrics", id: fabricId });

    const template = await admin
      .from("dress_templates")
      .insert({ name: "Flow kurta", slug: uniqueSlug("flow-kurta"), base_stitch_price: 500, required_measurements: FIELDS })
      .select("id")
      .single();
    if (template.error) throw template.error;
    created.push({ table: "dress_templates", id: template.data.id });

    const customerUser = await createUserWithRole("customer", "flow-cust");
    customer = await signedInClient(customerUser);
    const profile = await admin
      .from("measurement_profiles")
      .insert({
        customer_id: customerUser.userId,
        measurement_values: CONFIRMED,
        confirmed_by_id: customerUser.userId,
        confirmed_by_role: "customer",
        confirmed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (profile.error) throw profile.error;
    profileId = profile.data.id;
    created.push({ table: "measurement_profiles", id: profileId });

    const draft = await admin
      .from("order_drafts")
      .insert({ customer_id: customerUser.userId, fabric_id: fabricId, template_id: template.data.id, measurement_profile_id: profileId })
      .select("id")
      .single();
    if (draft.error) throw draft.error;
    created.push({ table: "order_drafts", id: draft.data.id });

    const hold = await admin
      .from("fabric_reservations")
      .insert({ fabric_id: fabricId, order_draft_id: draft.data.id, metres: 3, kind: "hard", status: "active" });
    if (hold.error) throw hold.error;

    const order = await admin.rpc("fn_create_order_from_draft", {
      p_draft_id: draft.data.id,
      p_amount: 12000,
      p_gateway_ref: uniqueSlug("pay"),
      p_event_id: uniqueSlug("evt"),
    });
    if (order.error) throw order.error;
    orderId = (order.data as { id: string }).id;
    orderNumber = (order.data as { number: string }).number;
    created.unshift({ table: "orders", id: orderId });
    // fn_create_order_from_draft snapshots the draft; the order item carries
    // the customer's confirmed values until approval.
    await admin.from("order_items").update({ measurements: CONFIRMED }).eq("order_id", orderId);

    jobId = ((await admin.from("production_jobs").select("id").eq("order_id", orderId).single()).data as { id: string }).id;
  }, 60000);

  afterAll(async () => {
    for (const { table, id } of created) await admin.from(table).delete().eq("id", id);
    await cleanupAll();
  });

  it("lists active tailors and QC for the admin", async () => {
    const ids = (await listProductionStaff(adminClient)).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([tailorId, qcId]));
  });

  it("a new order is secured and goes to the least busy tailor by itself (20261117500000)", async () => {
    expect(await orderStatus()).toBe("fabric_secured");
    const job = await admin.from("production_jobs").select("assigned_to_id").eq("id", jobId).single();
    // Both test tailors have no open jobs, so it's one of them, not a busier tailor.
    expect([tailorId, otherTailorId]).toContain(job.data?.assigned_to_id);
    const history = await admin.from("order_status_history").select("to_status, reason").eq("order_id", orderId).eq("to_status", "fabric_secured");
    expect(history.data?.[0]?.reason).toContain("Automatic");
    // Nothing left for the admin's button to do.
    await expect(markFabricSecured(adminClient, orderId)).rejects.toBeTruthy();
    await expect(markFabricSecured(tailor, orderId)).rejects.toBeTruthy();
  });

  it("only the assigned tailor can see or act on the job", async () => {
    await assignProductionJob(adminClient, { jobId, assignedToId: otherTailorId });
    await expect(recordFabricReceived(tailor, jobId)).rejects.toMatchObject({ message: expect.stringContaining("not assigned") });
    await assignProductionJob(adminClient, { jobId, assignedToId: tailorId });
    await expect(recordFabricReceived(otherTailor, jobId)).rejects.toMatchObject({ message: expect.stringContaining("not assigned") });
    expect((await otherTailor.from("production_jobs").select("id").eq("id", jobId)).data).toEqual([]);
  });

  it("the assigned tailor sees the hidden fabric and the customer's own measurements", async () => {
    expect((await tailor.from("fabrics").select("id").eq("id", fabricId)).data).toHaveLength(1);
    const profile = await tailor.from("measurement_profiles").select("measurement_values").eq("id", profileId).maybeSingle();
    expect(profile.data?.measurement_values).toEqual(CONFIRMED);
    // ...but no prices or payment: the orders table itself stays closed.
    expect((await tailor.from("orders").select("id").eq("id", orderId)).data).toEqual([]);
  });

  it("the tailor records the fabric as received", async () => {
    expect((await recordFabricReceived(tailor, jobId)).status).toBe("received_at_hub");
  });

  it("cutting is refused before approval", async () => {
    await expect(advanceStage(tailor, { jobId, toStage: "cutting" })).rejects.toBeTruthy();
    expect(await orderStatus()).toBe("received_at_hub");
  });

  it("approval checks the ranges, keeps the customer's set and records the correction", async () => {
    await expect(approveForProduction(tailor, { jobId, values: { chest: 300, waist: 72 } })).rejects.toMatchObject({
      message: expect.stringContaining("Chest must be between"),
    });

    const approved = await approveForProduction(tailor, { jobId, values: { chest: 92, waist: 72 }, reason: "Re-measured" });
    expect(approved.status).toBe("measurements_approved");

    const item = await admin.from("order_items").select("measurements").eq("order_id", orderId).single();
    expect(item.data?.measurements).toEqual({ chest: 92, waist: 72 });
    const profile = await admin.from("measurement_profiles").select("measurement_values").eq("id", profileId).single();
    expect(profile.data?.measurement_values).toEqual(CONFIRMED);
  });

  it("cutting takes the fabric off the roll and closes the order's hold", async () => {
    await advanceStage(tailor, { jobId, toStage: "cutting" });
    expect(await orderStatus()).toBe("in_cutting");
    const fabric = await admin.from("fabrics").select("stock_metres").eq("id", fabricId).single();
    expect(Number(fabric.data?.stock_metres)).toBe(47);
    const holds = await admin.from("fabric_reservations").select("status").eq("order_id", orderId);
    expect(holds.data?.map((h) => h.status)).toEqual(["converted"]);
  });

  it("stages only move forward one step", async () => {
    await expect(advanceStage(tailor, { jobId, toStage: "qc" })).rejects.toMatchObject({
      message: expect.stringContaining("Cannot move a job"),
    });
    await advanceStage(tailor, { jobId, toStage: "stitching" });
    await advanceStage(tailor, { jobId, toStage: "qc" });
    expect(await orderStatus()).toBe("in_qc");
  });

  it("sending it to quality check hands it to a QC by itself", async () => {
    const job = await admin.from("production_jobs").select("assignee:profiles!production_jobs_assigned_to_id_fkey(role)").eq("id", jobId).single();
    expect((job.data as unknown as { assignee: { role: string } }).assignee.role).toBe("qc");
  });

  it("a tailor can't pass QC (the job is already with QC)", async () => {
    await expect(advanceStage(tailor, { jobId, toStage: "passed" })).rejects.toMatchObject({
      message: expect.stringContaining("not assigned"),
    });
  });

  it("QC fails it back with a reason; it returns to the tailor, then back to the same QC", async () => {
    await assignProductionJob(adminClient, { jobId, assignedToId: qcId });
    await expect(advanceStage(qc, { jobId, toStage: "stitching" })).rejects.toMatchObject({
      message: expect.stringContaining("reason"),
    });
    const back = await advanceStage(qc, { jobId, toStage: "stitching", reason: "Hem uneven" });
    expect(await orderStatus()).toBe("in_stitching");
    expect(back.assigned_to_id).toBe(tailorId);

    const again = await advanceStage(tailor, { jobId, toStage: "qc" });
    expect(again.assigned_to_id).toBe(qcId);
  });

  it("the tailor still sees the work they handed on, as a summary; other staff don't", async () => {
    const history = await tailor.rpc("fn_my_production_history");
    expect(history.error).toBeNull();
    const row = (history.data as { job_id: string; order_number: string; my_last_step: string; order_status: string }[]).find(
      (r) => r.job_id === jobId,
    );
    expect(row).toMatchObject({ order_number: orderNumber, my_last_step: "qc", order_status: "in_qc" });
    expect(Object.keys(row ?? {})).not.toEqual(expect.arrayContaining(["measurements", "total", "customer_name"]));

    const other = await otherTailor.rpc("fn_my_production_history");
    expect((other.data as { job_id: string }[]).map((r) => r.job_id)).not.toContain(jobId);
    // QC holds the job now, so it's in QC's queue, not their history.
    const qcHistory = await qc.rpc("fn_my_production_history");
    expect((qcHistory.data as { job_id: string }[]).map((r) => r.job_id)).not.toContain(jobId);
  });

  it("QC sends a garment that can't be fixed for remake; the order waits in QC", async () => {
    await expect(advanceStage(qc, { jobId, toStage: "failed" })).rejects.toMatchObject({ message: expect.stringContaining("reason") });
    const failed = await advanceStage(qc, { jobId, toStage: "failed", reason: "Fabric torn at the seam" });
    expect(failed.stage).toBe("failed");
    expect(await orderStatus()).toBe("in_qc");
  });

  it("only an admin can order the remake; it opens an urgent job and records the fabric lost", async () => {
    await expect(createRemake(qc, { jobId, metresLost: 3, assignTo: tailorId })).rejects.toBeTruthy();

    // No one chosen: it goes back to the tailor who made it.
    const replacement = await createRemake(adminClient, { jobId, metresLost: 3 });
    expect(replacement.assigned_to_id).toBe(tailorId);
    expect(replacement.stage).toBe("approved");
    expect(replacement.priority).toBeGreaterThan(0);
    expect(await orderStatus()).toBe("measurements_approved");

    const remake = await admin
      .from("production_remakes")
      .select("reason, fabric_metres_lost, replacement_job_id")
      .eq("original_job_id", jobId)
      .single();
    expect(remake.data).toMatchObject({ reason: "Fabric torn at the seam", replacement_job_id: replacement.id });
    expect(Number(remake.data?.fabric_metres_lost)).toBe(3);
    await expect(createRemake(adminClient, { jobId, metresLost: 3, assignTo: tailorId })).rejects.toMatchObject({
      message: expect.stringContaining("already"),
    });

    // The failed job keeps its history, with the real previous stage each time.
    const events = await admin.from("production_events").select("from_stage, to_stage, reason").eq("job_id", jobId).order("created_at");
    expect(events.data?.map((e) => `${e.from_stage}>${e.to_stage}`)).toEqual([
      "pending>approved",
      "approved>cutting",
      "cutting>stitching",
      "stitching>qc",
      "qc>stitching",
      "stitching>qc",
      "qc>failed",
    ]);
    expect(events.data?.find((e) => e.to_stage === "approved")?.reason).toBe("Re-measured");
    jobId = replacement.id;
  });

  it("the remake is cut from new fabric, made and passed", async () => {
    await advanceStage(tailor, { jobId, toStage: "cutting" });
    const fabric = await admin.from("fabrics").select("stock_metres").eq("id", fabricId).single();
    expect(Number(fabric.data?.stock_metres)).toBe(44);
    await advanceStage(tailor, { jobId, toStage: "stitching" });
    await advanceStage(tailor, { jobId, toStage: "qc" });
    await assignProductionJob(adminClient, { jobId, assignedToId: qcId });
    const passed = await advanceStage(qc, { jobId, toStage: "passed" });
    expect(passed.stage).toBe("passed");
    expect(await orderStatus()).toBe("ready_to_ship");
  });

  it("dispatch sees the order with the address but no price; production staff don't", async () => {
    const row = await dispatcher.from("dispatch_order_view").select("number, cash_to_collect").eq("id", orderId).single();
    expect(row.data?.number).toBe(orderNumber);
    expect(row.data?.cash_to_collect).toBeNull(); // paid online
    expect((await tailor.from("dispatch_order_view").select("id").eq("id", orderId)).data).toEqual([]);
    await expect(dispatchOrder(tailor, { orderId, courier: "TCS", trackingRef: "T-1" })).rejects.toBeTruthy();
  });

  it("dispatch sends it out, records a failed attempt, sends it again and confirms delivery", async () => {
    expect(await dispatchOrder(dispatcher, { orderId, courier: "TCS", trackingRef: "T-1" })).toEqual({ status: "dispatched" });
    await expect(recordDeliveryFailure(dispatcher, { orderId, reason: " " })).rejects.toBeTruthy();
    const failed = await recordDeliveryFailure(dispatcher, { orderId, reason: "Nobody at home" });
    expect(failed).toMatchObject({ status: "delivery_failed", attempts: 1, last_failure_reason: "Nobody at home" });
    expect(await orderStatus()).toBe("dispatched");
    await expect(markDelivered(dispatcher, orderId)).rejects.toMatchObject({ message: expect.stringContaining("not out for delivery") });

    const again = await reattemptDelivery(dispatcher, { orderId, courier: "Leopards", trackingRef: "L-9" });
    expect(again).toMatchObject({ status: "dispatched", courier: "Leopards", tracking_ref: "L-9" });

    expect(await markDelivered(dispatcher, orderId)).toEqual({ status: "delivered" });
    const shipment = await admin.from("shipments").select("status, delivered_at").eq("order_id", orderId).single();
    expect(shipment.data?.status).toBe("delivered");
    expect(shipment.data?.delivered_at).not.toBeNull();
  });

  it("the customer sees the courier and tracking on their order", async () => {
    const shipment = await customer.from("shipments").select("courier, tracking_ref, status").eq("order_id", orderId).single();
    expect(shipment.data).toEqual({ courier: "Leopards", tracking_ref: "L-9", status: "delivered" });
  });
});
