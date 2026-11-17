import { beforeEach, describe, expect, it, vi } from "vitest";

// Thin Server Actions over already-tested backend modules (production,
// users) — these tests isolate the actions' own logic (Zod validation,
// actor-role checks) by mocking every collaborator at the boundary, same
// convention as (agent)/agent-actions.test.ts.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/production/listJobQueue", () => ({ listJobQueue: vi.fn() }));
vi.mock("@multife/backend/modules/production/assignProductionJob", () => ({ assignProductionJob: vi.fn() }));
vi.mock("@multife/backend/modules/production/approveForProduction", () => ({ approveForProduction: vi.fn() }));
vi.mock("@multife/backend/modules/production/advanceStage", () => ({ advanceStage: vi.fn() }));
vi.mock("@multife/backend/modules/production/recordFabricReceived", () => ({ recordFabricReceived: vi.fn() }));
vi.mock("@/lib/production-jobs", () => ({ getMyJob: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ kickNotifications: vi.fn() }));
vi.mock("@multife/backend/modules/production/measurementCorrections", () => ({ requestMeasurementCorrection: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { listJobQueue } from "@multife/backend/modules/production/listJobQueue";
import { assignProductionJob } from "@multife/backend/modules/production/assignProductionJob";
import { approveForProduction } from "@multife/backend/modules/production/approveForProduction";
import { advanceStage } from "@multife/backend/modules/production/advanceStage";
import { recordFabricReceived } from "@multife/backend/modules/production/recordFabricReceived";
import { getMyJob } from "@/lib/production-jobs";
import { requestMeasurementCorrection } from "@multife/backend/modules/production/measurementCorrections";
import {
  advanceStageAction,
  approveForProductionAction,
  approveJobMeasurementsAction,
  assignProductionJobAction,
  listJobQueueAction,
  recordFabricReceivedAction,
} from "./production-actions";

const fakeSupabase = {};
const UUID1 = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue(fakeSupabase as never);
});

describe("listJobQueueAction", () => {
  it("fails when nobody is signed in", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);

    const result = await listJobQueueAction();

    expect(result).toEqual({ ok: false, error: "Sign in as production staff to view your job queue." });
    expect(listJobQueue).not.toHaveBeenCalled();
  });

  it("fails when the signed-in profile isn't production staff", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "customer", status: "active" } as never);

    const result = await listJobQueueAction();

    expect(result).toEqual({ ok: false, error: "Sign in as production staff to view your job queue." });
  });

  it("returns the caller's own queue", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "tailor", status: "active" } as never);
    vi.mocked(listJobQueue).mockResolvedValue([{ id: "j1" } as never]);

    const result = await listJobQueueAction();

    expect(listJobQueue).toHaveBeenCalledWith(fakeSupabase, "p1");
    expect(result).toEqual({ ok: true, data: [{ id: "j1" }] });
  });
});

describe("assignProductionJobAction", () => {
  it("rejects a missing jobId", async () => {
    const result = await assignProductionJobAction({ assignedToId: UUID1 } as never);

    expect(result.ok).toBe(false);
    expect(assignProductionJob).not.toHaveBeenCalled();
  });

  it("fails when the caller isn't an admin", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "tailor", status: "active" } as never);

    const result = await assignProductionJobAction({ jobId: UUID1, assignedToId: UUID2 });

    expect(result).toEqual({ ok: false, error: "Only an admin can assign a production job." });
    expect(assignProductionJob).not.toHaveBeenCalled();
  });

  it("assigns the job when the caller is an active admin", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "admin", status: "active" } as never);
    vi.mocked(assignProductionJob).mockResolvedValue({ id: UUID1, assigned_to_id: UUID2 } as never);

    const result = await assignProductionJobAction({ jobId: UUID1, assignedToId: UUID2 });

    expect(assignProductionJob).toHaveBeenCalledWith(fakeSupabase, { jobId: UUID1, assignedToId: UUID2 });
    expect(result).toEqual({ ok: true, data: { id: UUID1, assigned_to_id: UUID2 } });
  });
});

describe("approveForProductionAction", () => {
  it("rejects a missing jobId", async () => {
    const result = await approveForProductionAction({ values: {} } as never);

    expect(result.ok).toBe(false);
    expect(approveForProduction).not.toHaveBeenCalled();
  });

  it("fails when the caller isn't a tailor or QC", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "dispatch", status: "active" } as never);

    const result = await approveForProductionAction({ jobId: UUID1, values: {} });

    expect(result).toEqual({ ok: false, error: "Only a tailor or QC can approve measurements for production." });
    expect(approveForProduction).not.toHaveBeenCalled();
  });

  it("approves when the caller is an active tailor", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "tailor", status: "active" } as never);
    vi.mocked(approveForProduction).mockResolvedValue({ id: "o1", status: "measurements_approved" } as never);

    const result = await approveForProductionAction({ jobId: UUID1, values: { chest: 40 }, reason: "corrected" });

    expect(approveForProduction).toHaveBeenCalledWith(fakeSupabase, {
      jobId: UUID1,
      values: { chest: 40 },
      reason: "corrected",
    });
    expect(result).toEqual({ ok: true, data: { id: "o1", status: "measurements_approved" } });
  });
});

describe("advanceStageAction", () => {
  it("rejects an invalid target stage", async () => {
    const result = await advanceStageAction({ jobId: UUID1, toStage: "not-a-stage" } as never);

    expect(result.ok).toBe(false);
    expect(advanceStage).not.toHaveBeenCalled();
  });

  it("fails when the caller isn't production staff", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "agent", status: "active" } as never);

    const result = await advanceStageAction({ jobId: UUID1, toStage: "cutting" });

    expect(result).toEqual({ ok: false, error: "Sign in as production staff to advance a job." });
    expect(advanceStage).not.toHaveBeenCalled();
  });

  it("advances the stage when the caller is an active tailor", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "tailor", status: "active" } as never);
    vi.mocked(advanceStage).mockResolvedValue({ id: UUID1, stage: "cutting" } as never);

    const result = await advanceStageAction({ jobId: UUID1, toStage: "cutting" });

    expect(advanceStage).toHaveBeenCalledWith(fakeSupabase, { jobId: UUID1, toStage: "cutting", reason: undefined });
    expect(result).toEqual({ ok: true, data: { id: UUID1, stage: "cutting" } });
  });
});

const activeAs = (role: string) =>
  vi.mocked(getCurrentProfile).mockResolvedValue({ id: UUID2, role, status: "active" } as never);

describe("recordFabricReceivedAction", () => {
  it("refuses dispatch staff", async () => {
    activeAs("dispatch");
    expect((await recordFabricReceivedAction({ jobId: UUID1 })).ok).toBe(false);
    expect(recordFabricReceived).not.toHaveBeenCalled();
  });

  it("records receipt for a tailor", async () => {
    activeAs("tailor");
    vi.mocked(recordFabricReceived).mockResolvedValue({ status: "received_at_hub" } as never);
    expect(await recordFabricReceivedAction({ jobId: UUID1 })).toEqual({ ok: true, data: { status: "received_at_hub" } });
    expect(recordFabricReceived).toHaveBeenCalledWith(fakeSupabase, UUID1);
  });
});

describe("approveJobMeasurementsAction", () => {
  beforeEach(() => {
    vi.mocked(approveForProduction).mockReset();
    vi.mocked(requestMeasurementCorrection).mockReset();
    vi.mocked(getMyJob).mockResolvedValue({
      confirmedMeasurements: { chest: 90, waist: 70 },
      correctionThreshold: 2,
      correction: null,
      orderStatus: "received_at_hub",
    } as never);
  });

  it("refuses a job that isn't the caller's", async () => {
    activeAs("tailor");
    vi.mocked(getMyJob).mockResolvedValue(null);
    expect(await approveJobMeasurementsAction({ jobId: UUID1, values: { chest: 90 } })).toEqual({
      ok: false,
      error: "This job isn't assigned to you.",
    });
  });

  it("approves the confirmed values without a reason", async () => {
    activeAs("qc");
    vi.mocked(approveForProduction).mockResolvedValue({ status: "measurements_approved" } as never);
    const result = await approveJobMeasurementsAction({ jobId: UUID1, values: { chest: 90, waist: 70 } });
    expect(result).toEqual({ ok: true, data: { status: "measurements_approved", outcome: "approved" } });
    expect(approveForProduction).toHaveBeenCalledWith(fakeSupabase, { jobId: UUID1, values: { chest: 90, waist: 70 }, reason: undefined });
  });

  it("needs a reason for a correction", async () => {
    activeAs("tailor");
    const result = await approveJobMeasurementsAction({ jobId: UUID1, values: { chest: 92, waist: 70 } });
    expect(result.ok).toBe(false);
    expect(approveForProduction).not.toHaveBeenCalled();
  });

  it("sends a correction beyond the threshold to the customer instead of approving", async () => {
    activeAs("tailor");
    vi.mocked(requestMeasurementCorrection).mockResolvedValue({ id: "c1" } as never);
    const result = await approveJobMeasurementsAction({ jobId: UUID1, values: { chest: 95, waist: 70 }, reason: "Re-measured" });
    expect(result).toEqual({ ok: true, data: { status: "received_at_hub", outcome: "sent_to_customer" } });
    expect(requestMeasurementCorrection).toHaveBeenCalledWith(fakeSupabase, { jobId: UUID1, values: { chest: 95, waist: 70 }, reason: "Re-measured" });
    expect(approveForProduction).not.toHaveBeenCalled();
  });

  it("approves a big change once the customer accepted exactly those values", async () => {
    activeAs("tailor");
    vi.mocked(getMyJob).mockResolvedValue({
      confirmedMeasurements: { chest: 90, waist: 70 },
      correctionThreshold: 2,
      correction: { status: "accepted", proposed: { chest: 95, waist: 70 } },
      orderStatus: "received_at_hub",
    } as never);
    vi.mocked(approveForProduction).mockResolvedValue({ status: "measurements_approved" } as never);
    const result = await approveJobMeasurementsAction({ jobId: UUID1, values: { chest: 95, waist: 70 }, reason: "Accepted" });
    expect(result).toEqual({ ok: true, data: { status: "measurements_approved", outcome: "approved" } });
    expect(requestMeasurementCorrection).not.toHaveBeenCalled();
  });

  it("passes the reason with a correction", async () => {
    activeAs("tailor");
    vi.mocked(approveForProduction).mockResolvedValue({ status: "measurements_approved" } as never);
    await approveJobMeasurementsAction({ jobId: UUID1, values: { chest: 92, waist: 70 }, reason: "Re-measured at fitting" });
    expect(approveForProduction).toHaveBeenCalledWith(fakeSupabase, {
      jobId: UUID1,
      values: { chest: 92, waist: 70 },
      reason: "Re-measured at fitting",
    });
  });
});
