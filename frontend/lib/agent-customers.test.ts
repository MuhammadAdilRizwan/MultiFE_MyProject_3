import { describe, expect, it } from "vitest";
import type { AssignedCustomerRow } from "@multife/backend/modules/agents/types";
import { customerLabel, matchesCustomer } from "./agent-customers";

const row = (customer: Partial<AssignedCustomerRow["customer"]>): AssignedCustomerRow => ({
  id: "a1",
  customer_id: "c1",
  acquired_at: "2026-11-16T00:00:00Z",
  source: null,
  customer: { full_name: null, email: null, phone: null, is_provisional: false, ...customer },
});

describe("customerLabel", () => {
  it("prefers the name, then the email", () => {
    expect(customerLabel({ full_name: "  Ayesha Khan ", email: "a@x.pk" })).toBe("Ayesha Khan");
    expect(customerLabel({ full_name: " ", email: "a@x.pk" })).toBe("a@x.pk");
    expect(customerLabel({ full_name: null, email: null })).toBe("Unnamed customer");
    expect(customerLabel(null)).toBe("Unnamed customer");
  });
});

describe("matchesCustomer", () => {
  const ayesha = row({ full_name: "Ayesha Khan", email: "ayesha@mail.pk", phone: "+923001234567" });

  it("matches everyone on an empty search", () => {
    expect(matchesCustomer(ayesha, "  ")).toBe(true);
  });

  it("matches name and email case-insensitively", () => {
    expect(matchesCustomer(ayesha, "KHAN")).toBe(true);
    expect(matchesCustomer(ayesha, "ayesha@")).toBe(true);
    expect(matchesCustomer(ayesha, "bilal")).toBe(false);
  });

  it("matches a local-format number against the stored +92 number", () => {
    expect(matchesCustomer(ayesha, "0300 123")).toBe(true);
    expect(matchesCustomer(ayesha, "0311")).toBe(false);
  });

  it("ignores very short digit searches", () => {
    expect(matchesCustomer(row({ phone: "+923001234567" }), "30")).toBe(false);
  });
});
