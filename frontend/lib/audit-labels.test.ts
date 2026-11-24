import { describe, expect, it } from "vitest";
import { auditActionLabel, auditArea, auditSummary } from "./audit-labels";

describe("auditActionLabel", () => {
  it("names known actions and tidies unknown ones", () => {
    expect(auditActionLabel("order.dispute_open")).toBe("Opened a dispute");
    expect(auditActionLabel("supplier.sync_failed")).toBe("Supplier sync failed");
  });

  it("names the security events", () => {
    expect(auditActionLabel("user.invite")).toBe("Sent an invite");
    expect(auditActionLabel("security.rate_limited")).toBe("Blocked too many attempts");
  });
});

describe("account deletion entries", () => {
  it("names the steps and summarises the orders kept", () => {
    expect(auditActionLabel("user.deletion_requested")).toBe("Customer asked to delete their account");
    expect(auditActionLabel("user.deleted")).toBe("Deleted a customer's account");
    expect(auditSummary(null, { request_id: "r1", orders_kept: 2 })).toBe("2 orders kept without their details");
    expect(auditSummary(null, { request_id: "r1", orders_kept: 1 })).toBe("1 order kept without their details");
    expect(auditSummary(null, { request_id: "r1", note: "Open dispute" })).toBe("“Open dispute”");
  });
});

describe("auditArea", () => {
  it("falls back to everything", () => {
    expect(auditArea("orders").prefix).toBe("order.");
    expect(auditArea("nope").key).toBe("all");
    expect(auditArea("security").prefix).toBe("security.");
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

  it("summarises a store connection change", () => {
    expect(auditSummary(null, { before: { provider_kind: "placeholder" }, provider_kind: "api" })).toBe(
      "Placeholder data (demo) → Store's system (API)",
    );
    expect(auditSummary(null, { before: null, provider_kind: "manual" })).toBe("Entered by MultiFe");
    expect(auditActionLabel("supplier.configure")).toBe("Changed a store's connection settings");
    expect(auditArea("stores").prefix).toBe("supplier.");
    expect(auditSummary(null, { role: "tailor" })).toBe("? → tailor");
    expect(auditSummary(null, { attempt: "sign_in", scope: "email", limit: 8 })).toBe("sign_in · by email · limit 8");
  });
});
