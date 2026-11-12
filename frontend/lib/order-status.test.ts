import { describe, expect, it } from "vitest";
import { ADMIN_ORDER_FILTERS, MILESTONES, adminOrderFilter, isClosedWithoutDelivery, milestoneIndex, orderStatusLabel } from "./order-status";

describe("orderStatusLabel", () => {
  it("names every order status for the customer", () => {
    expect(orderStatusLabel("placed")).toBe("Order placed");
    expect(orderStatusLabel("in_qc")).toBe("Quality check");
    expect(orderStatusLabel("dispatched")).toBe("On its way");
  });

  it("falls back for an unknown status", () => {
    expect(orderStatusLabel("something_new")).toBe("In progress");
  });
});

describe("milestoneIndex", () => {
  it("rolls internal statuses up into customer milestones", () => {
    expect(milestoneIndex("placed")).toBe(0);
    expect(milestoneIndex("measurements_approved")).toBe(1);
    expect(milestoneIndex("in_cutting")).toBe(2);
    expect(milestoneIndex("ready_to_ship")).toBe(3);
    expect(milestoneIndex("delivered")).toBe(MILESTONES.length - 1);
  });

  it("puts cancelled and failed orders on no milestone", () => {
    expect(milestoneIndex("cancelled")).toBe(-1);
    expect(isClosedWithoutDelivery("cancelled")).toBe(true);
    expect(isClosedWithoutDelivery("failed")).toBe(true);
    expect(isClosedWithoutDelivery("in_stitching")).toBe(false);
  });

  it("covers every non-terminal status exactly once", () => {
    const all = MILESTONES.flatMap((m) => [...m.statuses]);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(10);
  });
});

describe("admin order filters", () => {
  const every = ["placed", "fabric_secured", "received_at_hub", "measurements_approved", "in_cutting", "in_stitching", "in_qc", "ready_to_ship", "dispatched", "delivered", "cancelled", "failed"];

  it("open + delivered + cancelled cover every status exactly once", () => {
    const pick = (k: string) => ADMIN_ORDER_FILTERS.find((f) => f.key === k)!.statuses as readonly string[];
    const covered = [...pick("open"), ...pick("delivered"), ...pick("closed")];
    expect([...covered].sort()).toEqual([...every].sort());
  });

  it("falls back to All for an unknown key", () => {
    expect(adminOrderFilter("nope").key).toBe("all");
    expect(adminOrderFilter(undefined).statuses).toEqual([]);
    expect(adminOrderFilter("shipping").statuses).toEqual(["ready_to_ship", "dispatched"]);
  });
});
