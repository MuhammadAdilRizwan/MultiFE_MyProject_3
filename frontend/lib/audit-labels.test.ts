import { describe, expect, it } from "vitest";
import { auditActionLabel, auditArea, auditSummary } from "./audit-labels";

describe("auditActionLabel", () => {
  it("names known actions and tidies unknown ones", () => {
    expect(auditActionLabel("order.dispute_open")).toBe("Opened a dispute");
    expect(auditActionLabel("supplier.sync_failed")).toBe("Supplier sync failed");
  });
});

describe("auditArea", () => {
  it("falls back to everything", () => {
    expect(auditArea("orders").prefix).toBe("order.");
    expect(auditArea("nope").key).toBe("all");
  });
});

describe("auditSummary", () => {
  it("summarises role changes, statuses and notes", () => {
    expect(auditSummary({ role: "customer" }, { role: "agent", agent_code: "AG-1" })).toBe("customer → agent (AG-1)");
    expect(auditSummary({ status: "placed" }, { status: "cancelled", reason: "Asked to" })).toBe("placed → cancelled · “Asked to”");
    expect(auditSummary(null, { body: "Called her" })).toBe("“Called her”");
    expect(auditSummary(null, { fabric_metres_lost: 3 })).toBe("3 m fabric lost");
    expect(auditSummary(null, null)).toBeNull();
  });
});
