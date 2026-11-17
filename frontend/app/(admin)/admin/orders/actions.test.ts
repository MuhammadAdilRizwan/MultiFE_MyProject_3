import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/active-admin", () => ({ activeAdmin: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ kickNotifications: vi.fn() }));
vi.mock("@multife/backend/modules/orders/adminOrders", () => ({ adminCancelOrder: vi.fn(), addOrderNote: vi.fn() }));
vi.mock("@multife/backend/modules/orders/markFabricSecured", () => ({ markFabricSecured: vi.fn() }));
vi.mock("@multife/backend/modules/production/assignProductionJob", () => ({ assignProductionJob: vi.fn() }));
vi.mock("@multife/backend/modules/production/listProductionStaff", () => ({ listProductionStaff: vi.fn() }));
vi.mock("@multife/backend/modules/production/createRemake", () => ({ createRemake: vi.fn() }));

import { activeAdmin } from "@/lib/active-admin";
import { addOrderNote, adminCancelOrder } from "@multife/backend/modules/orders/adminOrders";
import { markFabricSecured } from "@multife/backend/modules/orders/markFabricSecured";
import { assignProductionJob } from "@multife/backend/modules/production/assignProductionJob";
import { listProductionStaff } from "@multife/backend/modules/production/listProductionStaff";
import { createRemake } from "@multife/backend/modules/production/createRemake";
import { addOrderNoteAction, adminCancelOrderAction, assignJobAction, createRemakeAction, markFabricSecuredAction } from "./actions";

const supabase = {};
const ORDER = "11111111-1111-4111-8111-111111111111";
const JOB = "22222222-2222-4222-8222-222222222222";
const TAILOR = "33333333-3333-4333-8333-333333333333";
const CUSTOMER = "44444444-4444-4444-8444-444444444444";
const NUMBER = "MF-2026-000001";

beforeEach(() => {
  vi.mocked(activeAdmin).mockResolvedValue({ supabase, adminId: "admin" } as never);
  vi.mocked(assignProductionJob).mockReset();
  vi.mocked(listProductionStaff).mockResolvedValue([{ id: TAILOR, full_name: "Bilal", email: null, role: "tailor" }]);
});

describe("markFabricSecuredAction", () => {
  it("refuses a non-admin", async () => {
    vi.mocked(activeAdmin).mockResolvedValue(null);
    expect((await markFabricSecuredAction({ orderId: ORDER, orderNumber: NUMBER })).ok).toBe(false);
    expect(markFabricSecured).not.toHaveBeenCalled();
  });

  it("moves the order on with the admin's session", async () => {
    vi.mocked(markFabricSecured).mockResolvedValue({ status: "fabric_secured" });
    expect(await markFabricSecuredAction({ orderId: ORDER, orderNumber: NUMBER })).toEqual({ ok: true, data: { status: "fabric_secured" } });
    expect(markFabricSecured).toHaveBeenCalledWith(supabase, ORDER);
  });
});

describe("assignJobAction", () => {
  it("assigns the job to an active tailor", async () => {
    expect(await assignJobAction({ jobId: JOB, staffId: TAILOR, orderNumber: NUMBER })).toEqual({ ok: true, data: { assignedToId: TAILOR } });
    expect(assignProductionJob).toHaveBeenCalledWith(supabase, { jobId: JOB, assignedToId: TAILOR });
  });

  it("refuses someone who isn't production staff", async () => {
    expect((await assignJobAction({ jobId: JOB, staffId: CUSTOMER, orderNumber: NUMBER })).ok).toBe(false);
    expect(assignProductionJob).not.toHaveBeenCalled();
  });
});

describe("createRemakeAction", () => {
  it("checks the metres before calling the database", async () => {
    expect((await createRemakeAction({ jobId: JOB, staffId: TAILOR, metresLost: -1, orderNumber: NUMBER })).ok).toBe(false);
    expect(createRemake).not.toHaveBeenCalled();
  });

  it("leaves the assignee to the database when 'Automatic' is chosen", async () => {
    vi.mocked(createRemake).mockResolvedValue({ id: "auto-job" } as never);
    await createRemakeAction({ jobId: JOB, staffId: "", metresLost: 2, orderNumber: NUMBER });
    expect(createRemake).toHaveBeenLastCalledWith(supabase, { jobId: JOB, metresLost: 2, assignTo: undefined });
  });

  it("orders the remake with the admin's session", async () => {
    vi.mocked(createRemake).mockResolvedValue({ id: "new-job" } as never);
    expect(await createRemakeAction({ jobId: JOB, staffId: TAILOR, metresLost: 3, orderNumber: NUMBER })).toEqual({ ok: true, data: { jobId: "new-job" } });
    expect(createRemake).toHaveBeenCalledWith(supabase, { jobId: JOB, metresLost: 3, assignTo: TAILOR });
  });
});

describe("adminCancelOrderAction", () => {
  it("needs a reason", async () => {
    expect((await adminCancelOrderAction({ orderId: ORDER, orderNumber: NUMBER, reason: " " })).ok).toBe(false);
    expect(adminCancelOrder).not.toHaveBeenCalled();
  });

  it("cancels and reports the refund state", async () => {
    vi.mocked(adminCancelOrder).mockResolvedValue({ status: "cancelled", payment_status: "refund_pending" });
    expect(await adminCancelOrderAction({ orderId: ORDER, orderNumber: NUMBER, reason: "Customer asked" })).toEqual({
      ok: true,
      data: { paymentStatus: "refund_pending" },
    });
    expect(adminCancelOrder).toHaveBeenCalledWith(supabase, { orderId: ORDER, reason: "Customer asked" });
  });

  it("explains a refusal only when it's the database's own wording", async () => {
    vi.mocked(adminCancelOrder).mockRejectedValue(new Error("Order MF-2026-000001 is already delivered"));
    expect(await adminCancelOrderAction({ orderId: ORDER, orderNumber: NUMBER, reason: "Late" })).toEqual({
      ok: false,
      error: "Order MF-2026-000001 is already delivered.",
    });
  });
});

describe("addOrderNoteAction", () => {
  it("saves a dispute note with the admin's session", async () => {
    vi.mocked(addOrderNote).mockResolvedValue({} as never);
    expect(await addOrderNoteAction({ orderId: ORDER, orderNumber: NUMBER, kind: "dispute_opened", body: "Sleeve too short" })).toEqual({ ok: true, data: null });
    expect(addOrderNote).toHaveBeenCalledWith(supabase, { orderId: ORDER, kind: "dispute_opened", body: "Sleeve too short" });
  });

  it("refuses a non-admin and an empty note", async () => {
    expect((await addOrderNoteAction({ orderId: ORDER, orderNumber: NUMBER, kind: "note", body: "x" })).ok).toBe(false);
    vi.mocked(activeAdmin).mockResolvedValue(null);
    expect((await addOrderNoteAction({ orderId: ORDER, orderNumber: NUMBER, kind: "note", body: "Called" })).ok).toBe(false);
  });
});
