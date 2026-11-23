import { describe, expect, it } from "vitest";
import {
  changedMeasurements,
  countJobSteps,
  isJobStep,
  jobStep,
  jobStepLabel,
  jobStepsFor,
  isJobDone,
  isJobOverdue,
  isProductionRole,
  maxMeasurementChange,
  myStepLabel,
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

describe("myStepLabel", () => {
  it("says what the staff member did, with a fallback", () => {
    expect(myStepLabel("qc")).toBe("Sent it to quality check");
    expect(myStepLabel("passed")).toBe("Passed quality check");
    expect(myStepLabel("weird")).toBe("Worked on it");
  });
});

describe("job step filter", () => {
  it("puts each open job at the step its sheet's button does next, in workflow order", () => {
    expect(jobStep("pending", "fabric_secured", "tailor")).toBe("receive");
    expect(jobStep("pending", "received_at_hub", "tailor")).toBe("approve");
    expect(jobStep("approved", "measurements_approved", "tailor")).toBe("cut");
    expect(jobStep("cutting", "in_cutting", "tailor")).toBe("stitch");
    expect(jobStep("stitching", "in_stitching", "tailor")).toBe("send_qc");
  });

  it("gives QC their own check step and leaves a tailor's QC-stage job waiting", () => {
    expect(jobStep("qc", "in_qc", "qc")).toBe("check");
    expect(jobStep("qc", "in_qc", "tailor")).toBe("waiting");
  });

  it("counts anything that can't be acted on yet as waiting", () => {
    expect(jobStep("pending", "placed", "tailor")).toBe("waiting");
    expect(jobStep("weird", "placed", "tailor")).toBe("waiting");
  });

  it("counts jobs per step", () => {
    const counts = countJobSteps(
      [
        { stage: "pending", orderStatus: "fabric_secured" },
        { stage: "pending", orderStatus: "received_at_hub" },
        { stage: "pending", orderStatus: "received_at_hub" },
        { stage: "stitching", orderStatus: "in_stitching" },
      ],
      "tailor",
    );
    expect(counts).toEqual({ receive: 1, approve: 2, cut: 0, stitch: 0, send_qc: 1, check: 0, waiting: 0 });
  });

  it("shows tailors every making step, QC the check step too, and waiting only when used", () => {
    const none = { receive: 0, approve: 0, cut: 0, stitch: 0, send_qc: 0, check: 0, waiting: 0 };
    expect(jobStepsFor("tailor", none)).toEqual(["receive", "approve", "cut", "stitch", "send_qc"]);
    expect(jobStepsFor("qc", none)).toEqual(["receive", "approve", "cut", "stitch", "send_qc", "check"]);
    expect(jobStepsFor("tailor", { ...none, waiting: 2 })).toContain("waiting");
  });

  it("validates a step from the URL and labels it", () => {
    expect(isJobStep("cut")).toBe(true);
    expect(isJobStep("delete")).toBe(false);
    expect(isJobStep(undefined)).toBe(false);
    expect(jobStepLabel("stitch")).toBe("Cutting done – start stitching");
  });
});
