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

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { listJobQueue } from "@multife/backend/modules/production/listJobQueue";
import { assignProductionJob } from "@multife/backend/modules/production/assignProductionJob";
import { approveForProduction } from "@multife/backend/modules/production/approveForProduction";
import { advanceStage } from "@multife/backend/modules/production/advanceStage";
import {
  advanceStageAction,
  approveForProductionAction,
  assignProductionJobAction,
  listJobQueueAction,
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
