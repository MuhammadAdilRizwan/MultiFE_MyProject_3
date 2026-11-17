import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { advanceStage } from "../../modules/production/advanceStage";
import { approveForProduction } from "../../modules/production/approveForProduction";
import { confirmDelivery } from "../../modules/fulfilment/confirmDelivery";
import { dispatchOrder } from "../../modules/fulfilment/dispatchOrder";
import { listReadyToShip } from "../../modules/fulfilment/listReadyToShip";
import { cleanupAll, createOrderInProduction, createUserWithRole, signedInClient } from "./support";

describe("fulfilment RLS isolation", () => {
  let tailor1: Awaited<ReturnType<typeof createUserWithRole>>;
  let qc1: Awaited<ReturnType<typeof createUserWithRole>>;
  let dispatch1: Awaited<ReturnType<typeof createUserWithRole>>;
  let nonStaffCustomer: Awaited<ReturnType<typeof createUserWithRole>>;
  let order: Awaited<ReturnType<typeof createOrderInProduction>>;

  beforeAll(async () => {
    tailor1 = await createUserWithRole("tailor", "ff-tailor1");
    qc1 = await createUserWithRole("qc", "ff-qc1");
    dispatch1 = await createUserWithRole("dispatch", "ff-dispatch1");
    nonStaffCustomer = await createUserWithRole("customer", "ff-cust");
    order = await createOrderInProduction("ff-order");

    // Walk the order to ready_to_ship exactly as a real tailor/QC would —
    // service-role can't call these (they require a real auth.uid()), so
    // this reuses the same pattern already proven in production.test.ts.
    // The final "passed" step hardcodes p_actor_role = 'qc' in
    // fn_advance_production_stage, so it must be called by a real QC user.
    const tailorClient = await signedInClient(tailor1);
    await approveForProduction(tailorClient, { jobId: order.jobId, values: {} });
    await advanceStage(tailorClient, { jobId: order.jobId, toStage: "cutting" });
    await advanceStage(tailorClient, { jobId: order.jobId, toStage: "stitching" });
    await advanceStage(tailorClient, { jobId: order.jobId, toStage: "qc" });
    const qcClient = await signedInClient(qc1);
    await advanceStage(qcClient, { jobId: order.jobId, toStage: "passed" });
  }, 30000);

  afterAll(async () => {
    await cleanupAll();
  });

  it("a dispatch user's queue includes the ready-to-ship order", async () => {
    const dispatchClient = await signedInClient(dispatch1);
    const queue = await listReadyToShip(dispatchClient);
    expect(queue.map((o) => o.id)).toContain(order.orderId);
  });

  it("an unassigned, non-dispatch tailor's queue does not include it", async () => {
    const otherTailor = await createUserWithRole("tailor", "ff-tailor2");
    const otherClient = await signedInClient(otherTailor);
    const queue = await listReadyToShip(otherClient);
    expect(queue.map((o) => o.id)).not.toContain(order.orderId);
  });

  it("a non-dispatch, non-admin actor cannot dispatch the order", async () => {
    const customerClient = await signedInClient(nonStaffCustomer);
    await expect(
      dispatchOrder(customerClient, { orderId: order.orderId, courier: "TCS", trackingRef: "TCS-1" }),
    ).rejects.toBeTruthy();
  });

  it("dispatch records courier and tracking, moving the order to dispatched", async () => {
    const dispatchClient = await signedInClient(dispatch1);
    const dispatched = await dispatchOrder(dispatchClient, { orderId: order.orderId, courier: "TCS", trackingRef: "TCS-1" });
    expect(dispatched.status).toBe("dispatched");
  });

  it("dispatch confirms delivery, moving the order to delivered", async () => {
    const dispatchClient = await signedInClient(dispatch1);
    const delivered = await confirmDelivery(dispatchClient, { orderId: order.orderId, actorRole: "dispatch" });
    expect(delivered.status).toBe("delivered");
  });
});
