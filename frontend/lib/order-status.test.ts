import { describe, expect, it } from "vitest";
import { MILESTONES, isClosedWithoutDelivery, milestoneIndex, orderStatusLabel } from "./order-status";

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
