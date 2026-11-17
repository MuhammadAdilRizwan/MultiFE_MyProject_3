import { describe, expect, it } from "vitest";
import {
  changedMeasurements,
  isJobDone,
  isJobOverdue,
  isProductionRole,
  maxMeasurementChange,
  nextStep,
  sameMeasurements,
  sortJobs,
  stageLabel,
} from "./production-stage";

describe("nextStep", () => {
  it("waits for the admin while the fabric isn't secured", () => {
    expect(nextStep("pending", "placed", "tailor").kind).toBe("wait");
  });

  it("asks the tailor to record receipt, then to approve measurements", () => {
    expect(nextStep("pending", "fabric_secured", "tailor")).toEqual({ kind: "receive" });
    expect(nextStep("pending", "received_at_hub", "qc")).toEqual({ kind: "approve" });
  });

  it("walks the job through cutting, stitching and QC", () => {
    expect(nextStep("approved", "measurements_approved", "tailor")).toMatchObject({ kind: "advance", to: "cutting" });
    expect(nextStep("cutting", "in_cutting", "tailor")).toMatchObject({ kind: "advance", to: "stitching" });
    expect(nextStep("stitching", "in_stitching", "tailor")).toMatchObject({ kind: "advance", to: "qc" });
  });

  it("lets only QC pass or fail a job", () => {
    expect(nextStep("qc", "in_qc", "qc")).toEqual({ kind: "qc" });
    expect(nextStep("qc", "in_qc", "tailor").kind).toBe("wait");
  });

  it("gives dispatch nothing to do in the workshop", () => {
    expect(nextStep("approved", "measurements_approved", "dispatch").kind).toBe("wait");
  });

  it("closes the job when it passed, was failed, or the order was cancelled", () => {
    expect(nextStep("passed", "ready_to_ship", "qc").kind).toBe("closed");
    expect(nextStep("failed", "in_qc", "qc").kind).toBe("closed");
    expect(nextStep("cutting", "cancelled", "tailor").kind).toBe("closed");
  });
});

describe("job state helpers", () => {
  it("labels stages, with a fallback", () => {
    expect(stageLabel("qc")).toBe("Quality check");
    expect(stageLabel("weird")).toBe("In progress");
  });

  it("knows production roles", () => {
    expect(isProductionRole("tailor")).toBe(true);
    expect(isProductionRole("admin")).toBe(false);
    expect(isProductionRole(null)).toBe(false);
  });

  it("treats passed, failed and cancelled jobs as done", () => {
    expect(isJobDone("passed", "ready_to_ship")).toBe(true);
    expect(isJobDone("cutting", "cancelled")).toBe(true);
    expect(isJobDone("cutting", "in_cutting")).toBe(false);
  });

  it("flags open jobs past their due date", () => {
    const job = { stage: "stitching", orderStatus: "in_stitching", dueDate: "2026-11-10" };
    expect(isJobOverdue(job, "2026-11-16")).toBe(true);
    expect(isJobOverdue({ ...job, dueDate: "2026-11-20" }, "2026-11-16")).toBe(false);
    expect(isJobOverdue({ ...job, stage: "passed" }, "2026-11-16")).toBe(false);
    expect(isJobOverdue({ ...job, dueDate: null }, "2026-11-16")).toBe(false);
  });
});

describe("changedMeasurements", () => {
  it("lists only values that differ from the confirmed set", () => {
    expect(changedMeasurements({ chest: 90, waist: 70 }, { chest: 92, waist: 70, hip: 95 })).toEqual(["chest"]);
  });
});

describe("sortJobs", () => {
  it("puts urgent jobs first, then the earliest due date, then the oldest", () => {
    const jobs = [
      { id: "a", priority: 0, dueDate: "2026-11-20", createdAt: "2026-11-01" },
      { id: "b", priority: 0, dueDate: "2026-11-18", createdAt: "2026-11-05" },
      { id: "c", priority: 1, dueDate: null, createdAt: "2026-11-09" },
      { id: "d", priority: 0, dueDate: "2026-11-18", createdAt: "2026-11-02" },
    ];
    expect(sortJobs(jobs).map((j) => j.id)).toEqual(["c", "d", "b", "a"]);
  });
});

describe("correction helpers", () => {
  it("finds the largest single change", () => {
    expect(maxMeasurementChange({ chest: 90, waist: 70 }, { chest: 93, waist: 69 })).toBe(3);
    expect(maxMeasurementChange({ chest: 90 }, { chest: 90, hip: 100 })).toBe(0);
  });

  it("compares two sets exactly", () => {
    expect(sameMeasurements({ chest: 94, waist: 72 }, { waist: 72, chest: 94 })).toBe(true);
    expect(sameMeasurements({ chest: 94 }, { chest: 94, waist: 72 })).toBe(false);
  });
});
