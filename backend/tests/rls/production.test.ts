import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { advanceStage } from "../../modules/production/advanceStage";
import { approveForProduction } from "../../modules/production/approveForProduction";
import { assignProductionJob } from "../../modules/production/assignProductionJob";
import { listJobQueue } from "../../modules/production/listJobQueue";
import { cleanupAll, createOrderInProduction, createUserWithRole, signedInClient } from "./support";

describe("production RLS isolation", () => {
  let tailor1: Awaited<ReturnType<typeof createUserWithRole>>;
  let tailor2: Awaited<ReturnType<typeof createUserWithRole>>;
  let qc1: Awaited<ReturnType<typeof createUserWithRole>>;
  let adminUser: Awaited<ReturnType<typeof createUserWithRole>>;
  let nonStaffCustomer: Awaited<ReturnType<typeof createUserWithRole>>;
  let order: Awaited<ReturnType<typeof createOrderInProduction>>;

  beforeAll(async () => {
    tailor1 = await createUserWithRole("tailor", "tailor1");
    tailor2 = await createUserWithRole("tailor", "tailor2");
    qc1 = await createUserWithRole("qc", "qc1");
    adminUser = await createUserWithRole("admin", "prod-admin");
    nonStaffCustomer = await createUserWithRole("customer", "prod-cust");
    order = await createOrderInProduction("prod-order");
  }, 30000);

  afterAll(async () => {
    await cleanupAll();
  });

  it("an unassigned tailor's queue is empty", async () => {
    const client = await signedInClient(tailor1);
    expect(await listJobQueue(client, tailor1.userId)).toEqual([]);
  });

  it("after an admin assigns the job, only the assigned tailor's queue shows it", async () => {
    const adminClient = await signedInClient(adminUser);
    const assigned = await assignProductionJob(adminClient, { jobId: order.jobId, assignedToId: tailor1.userId });
    expect(assigned.assigned_to_id).toBe(tailor1.userId);

    const tailor1Client = await signedInClient(tailor1);
    const tailor1Queue = await listJobQueue(tailor1Client, tailor1.userId);
    expect(tailor1Queue.map((j) => j.id)).toContain(order.jobId);

    const tailor2Client = await signedInClient(tailor2);
    expect(await listJobQueue(tailor2Client, tailor2.userId)).toEqual([]);
  });

  it("a non-admin cannot assign a job", async () => {
    const customerClient = await signedInClient(nonStaffCustomer);
    await expect(
      assignProductionJob(customerClient, { jobId: order.jobId, assignedToId: nonStaffCustomer.userId }),
    ).rejects.toBeTruthy();
  });

  it("a customer cannot approve a job for production", async () => {
    const customerClient = await signedInClient(nonStaffCustomer);
    await expect(
      approveForProduction(customerClient, { jobId: order.jobId, values: {} }),
    ).rejects.toMatchObject({ message: expect.stringContaining("tailor or QC") });
  });

  it("the assigned tailor can approve the job for production (the cutting gate)", async () => {
    const tailorClient = await signedInClient(tailor1);
    const approved = await approveForProduction(tailorClient, { jobId: order.jobId, values: {} });
    expect(approved.status).toBe("measurements_approved");
    expect(approved.production_approved_at).not.toBeNull();
  });

  it("the tailor advances the job through cutting, stitching and qc", async () => {
    const tailorClient = await signedInClient(tailor1);

    await advanceStage(tailorClient, { jobId: order.jobId, toStage: "cutting" });
    let [view] = (await tailorClient.from("production_order_view").select("status").eq("id", order.orderId)).data as
      | { status: string }[]
      | null ?? [];
    expect(view?.status).toBe("in_cutting");

    await advanceStage(tailorClient, { jobId: order.jobId, toStage: "stitching" });
    [view] = (await tailorClient.from("production_order_view").select("status").eq("id", order.orderId)).data as
      | { status: string }[]
      | null ?? [];
    expect(view?.status).toBe("in_stitching");

    await advanceStage(tailorClient, { jobId: order.jobId, toStage: "qc" });
    [view] = (await tailorClient.from("production_order_view").select("status").eq("id", order.orderId)).data as
      | { status: string }[]
      | null ?? [];
    expect(view?.status).toBe("in_qc");
  });

  it("only a QC-role user can pass the job to ready_to_ship", async () => {
    const tailorClient = await signedInClient(tailor1);
    await expect(advanceStage(tailorClient, { jobId: order.jobId, toStage: "passed" })).rejects.toBeTruthy();

    const qcClient = await signedInClient(qc1);
    await advanceStage(qcClient, { jobId: order.jobId, toStage: "passed" });

    const [view] = (await tailorClient.from("production_order_view").select("status").eq("id", order.orderId)).data as
      | { status: string }[]
      | null ?? [];
    expect(view?.status).toBe("ready_to_ship");
  });
});
