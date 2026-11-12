import { beforeEach, describe, expect, it, vi } from "vitest";

// The checkout Server Actions' own logic: who may act on a draft, input
// validation, and what reaches the order function. Collaborators that touch
// the database are mocked; the pure rules (validateMeasurements,
// resolveSelection, isSelectionSupported) run for real.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@/lib/draft-pricing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/draft-pricing")>()),
  loadAndPriceDraft: vi.fn(),
}));
vi.mock("@multife/backend/modules/measurements/getMeasurementProfile", () => ({ getLatestConfirmedProfile: vi.fn() }));
vi.mock("@multife/backend/modules/measurements/saveConfirmedMeasurements", () => ({ saveConfirmedMeasurements: vi.fn() }));
vi.mock("@multife/backend/modules/orders/placeCodOrder", () => ({ placeCodOrder: vi.fn() }));
vi.mock("@multife/backend/modules/orders/takeSoftReservation", () => ({ takeSoftReservation: vi.fn() }));
vi.mock("@multife/backend/modules/agents/getCurrentAgent", () => ({ getCurrentAgent: vi.fn() }));
vi.mock("@multife/backend/modules/agents/getMyCustomer", () => ({ getMyCustomer: vi.fn() }));
vi.mock("@multife/backend/modules/agents/recordConsent", () => ({ recordConsent: vi.fn(), hasDraftConsent: vi.fn() }));
vi.mock("@multife/backend/modules/agents/saveAgentMeasurements", () => ({ saveAgentMeasurements: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { loadAndPriceDraft } from "@/lib/draft-pricing";
import { getLatestConfirmedProfile } from "@multife/backend/modules/measurements/getMeasurementProfile";
import { saveConfirmedMeasurements } from "@multife/backend/modules/measurements/saveConfirmedMeasurements";
import { placeCodOrder } from "@multife/backend/modules/orders/placeCodOrder";
import { takeSoftReservation } from "@multife/backend/modules/orders/takeSoftReservation";
import { DELIVERY_DAYS } from "@multife/backend/modules/rules/orderSummary";
import { getCurrentAgent } from "@multife/backend/modules/agents/getCurrentAgent";
import { getMyCustomer } from "@multife/backend/modules/agents/getMyCustomer";
import { hasDraftConsent, recordConsent } from "@multife/backend/modules/agents/recordConsent";
import { saveAgentMeasurements } from "@multife/backend/modules/agents/saveAgentMeasurements";
import {
  getCheckoutAction,
  getMeasurementStepAction,
  placeOrderAction,
  recordConsentAction,
  saveMeasurementsAction,
} from "./checkout-actions";

const session = { kind: "session" };
const service = { kind: "service" };
const draftId = "423e4567-e89b-12d3-a456-426614174000";
const key = "523e4567-e89b-12d3-a456-426614174000";
const customer = { id: "c1", role: "customer", status: "active", full_name: "Ayesha", phone: "03001234567", email: "a@x.test" };

const fields = [
  { key: "chest", label: "Chest", unit: "cm", min: 75, max: 135 },
  { key: "waist", label: "Waist", unit: "cm", min: 60, max: 125 },
];
const pricing = { yardageMetres: 5.1, fabricCost: 6120, stitchCost: 3200, optionsCost: 600, adjustment: 0, total: 9920 };
const evaluatedOptions = [
  {
    groupKey: "neck-finish",
    groupLabel: "Front / Back Finish",
    values: [
      { key: "closed-back", label: "Closed Back", priceDelta: 0, extraLeadDays: 0, isDefault: true },
      { key: "embroidered-front", label: "Embroidered Front", priceDelta: 600, extraLeadDays: 1, isDefault: false },
    ],
  },
];

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    draft: {
      id: draftId,
      customer_id: "c1",
      fabric_id: "f1",
      template_id: "t1",
      options: { "neck-finish": "embroidered-front" },
      measurement_profile_id: "p1",
      step: "measurements",
    },
    fabric: { id: "f1" },
    template: { lead_days: 10, required_measurements: fields },
    evaluatedOptions,
    profile: { id: "p1", measurement_values: { chest: 96, waist: 80 }, confirmed_at: "2026-11-11T10:00:00Z" },
    yardageMetres: 5.1,
    pricing,
    ...overrides,
  };
}

const delivery = { fullName: "Ayesha Khan", phone: "0300 1234567", addressLine: "House 12, Street 4, Gulberg", city: "Lahore" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(session as never);
  vi.mocked(createAdminClient).mockReturnValue(service as never);
  vi.mocked(getCurrentProfile).mockResolvedValue(customer as never);
  vi.mocked(loadAndPriceDraft).mockResolvedValue(ctx() as never);
});

describe("who may check out a draft", () => {
  it("refuses a guest", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const result = await getCheckoutAction({ draftId });
    expect(result).toEqual({ ok: false, error: "Sign in with your customer account to continue." });
  });

  it("refuses a non-customer role", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...customer, role: "admin" } as never);
    expect((await getCheckoutAction({ draftId })).ok).toBe(false);
  });

  it("refuses someone else's draft", async () => {
    vi.mocked(loadAndPriceDraft).mockResolvedValue(ctx({ draft: { ...ctx().draft, customer_id: "someone-else" } }) as never);
    expect(await getCheckoutAction({ draftId })).toEqual({ ok: false, error: "Draft not found." });
  });

  it("refuses a draft that is already an order", async () => {
    vi.mocked(loadAndPriceDraft).mockResolvedValue(ctx({ draft: { ...ctx().draft, step: "ordered" } }) as never);
    expect(await placeOrderAction({ draftId, idempotencyKey: key, delivery })).toEqual({
      ok: false,
      error: "This order has already been placed.",
    });
    expect(placeCodOrder).not.toHaveBeenCalled();
  });
});

describe("getMeasurementStepAction", () => {
  it("prefills from the draft's own confirmed set", async () => {
    const result = await getMeasurementStepAction({ draftId });
    expect(result).toEqual({
      ok: true,
      data: { fields, values: { chest: 96, waist: 80 }, prefilledFrom: "draft", mode: "customer", consentRecorded: true },
    });
  });

  it("falls back to the customer's last confirmed set, keeping only this template's fields", async () => {
    vi.mocked(loadAndPriceDraft).mockResolvedValue(ctx({ profile: null }) as never);
    vi.mocked(getLatestConfirmedProfile).mockResolvedValue({ measurement_values: { chest: 90, hip: 100 } } as never);

    const result = await getMeasurementStepAction({ draftId });

    expect(getLatestConfirmedProfile).toHaveBeenCalledWith(session, "c1");
    expect(result).toEqual({
      ok: true,
      data: { fields, values: { chest: 90 }, prefilledFrom: "saved", mode: "customer", consentRecorded: true },
    });
  });

  it("returns empty values for a first-time customer", async () => {
    vi.mocked(loadAndPriceDraft).mockResolvedValue(ctx({ profile: null }) as never);
    vi.mocked(getLatestConfirmedProfile).mockResolvedValue(null);
    expect(await getMeasurementStepAction({ draftId })).toEqual({
      ok: true,
      data: { fields, values: null, prefilledFrom: null, mode: "customer", consentRecorded: true },
    });
  });
});

describe("saveMeasurementsAction", () => {
  it("requires the customer's explicit confirmation", async () => {
    const result = await saveMeasurementsAction({ draftId, values: { chest: 96, waist: 80 }, confirmed: false } as never);
    expect(result.ok).toBe(false);
    expect(saveConfirmedMeasurements).not.toHaveBeenCalled();
  });

  it("rejects out-of-range values with the field's message", async () => {
    const result = await saveMeasurementsAction({ draftId, values: { chest: 300, waist: 80 }, confirmed: true });
    expect(result).toEqual({ ok: false, error: "Chest must be between 75 and 135 cm." });
    expect(saveConfirmedMeasurements).not.toHaveBeenCalled();
  });

  it("saves the validated set, re-prices, and holds the fabric for the measured quantity", async () => {
    const result = await saveMeasurementsAction({ draftId, values: { chest: "96", waist: 80 }, confirmed: true });

    expect(saveConfirmedMeasurements).toHaveBeenCalledWith(session, {
      customerId: "c1",
      draftId,
      values: { chest: 96, waist: 80 },
      currentProfileId: "p1",
    });
    expect(takeSoftReservation).toHaveBeenCalledWith(session, { draftId, fabricId: "f1", metres: 5.1 });
    expect(result).toEqual({ ok: true, data: pricing });
  });

  it("shows the stock message when the fabric can't be held", async () => {
    vi.mocked(takeSoftReservation).mockRejectedValue({ message: "Not enough fabric in stock" });
    const result = await saveMeasurementsAction({ draftId, values: { chest: 96, waist: 80 }, confirmed: true });
    expect(result).toEqual({ ok: false, error: "Not enough fabric in stock" });
  });

  it("hides unexpected database errors behind a generic message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(saveConfirmedMeasurements).mockRejectedValue(new Error('relation "x" does not exist'));
    const result = await saveMeasurementsAction({ draftId, values: { chest: 96, waist: 80 }, confirmed: true });
    expect(result).toEqual({ ok: false, error: "Something went wrong. Please try again." });
  });
});

describe("getCheckoutAction", () => {
  it("needs confirmed measurements", async () => {
    vi.mocked(loadAndPriceDraft).mockResolvedValue(ctx({ profile: null }) as never);
    expect(await getCheckoutAction({ draftId })).toEqual({ ok: false, error: "Confirm your measurements first." });
  });

  it("summarises price, measurements, chosen options, the 14-day delivery date and contact", async () => {
    const result = await getCheckoutAction({ draftId });
    if (!result.ok) throw new Error(result.error);

    const expected = new Date();
    expected.setDate(expected.getDate() + DELIVERY_DAYS);
    expect(result.data).toEqual({
      pricing,
      measurements: [
        { key: "chest", label: "Chest", unit: "cm", value: 96 },
        { key: "waist", label: "Waist", unit: "cm", value: 80 },
      ],
      options: [
        { group: "neck-finish", group_label: "Front / Back Finish", value: "embroidered-front", label: "Embroidered Front", price_delta: 600 },
      ],
      estDeliveryDate: expected.toISOString().slice(0, 10),
      contact: { fullName: "Ayesha", phone: "03001234567" },
      mode: "customer",
    });
  });
});

describe("placeOrderAction", () => {
  it("validates the delivery address", async () => {
    const result = await placeOrderAction({ draftId, idempotencyKey: key, delivery: { ...delivery, phone: "abc" } });
    expect(result).toEqual({ ok: false, error: "Enter a valid phone number." });
    expect(placeCodOrder).not.toHaveBeenCalled();
  });

  it("needs an idempotency key", async () => {
    expect((await placeOrderAction({ draftId, idempotencyKey: "nope", delivery })).ok).toBe(false);
  });

  it("refuses a selection the fabric no longer supports", async () => {
    vi.mocked(loadAndPriceDraft).mockResolvedValue(ctx({ draft: { ...ctx().draft, options: { "neck-finish": "gone" } } }) as never);
    const result = await placeOrderAction({ draftId, idempotencyKey: key, delivery });
    expect(result.ok).toBe(false);
    expect(placeCodOrder).not.toHaveBeenCalled();
  });

  it("places a COD order with the server's price and snapshot, via the service client", async () => {
    vi.mocked(placeCodOrder).mockResolvedValue({ id: "o1", number: "MF-2026-000001", total: 9920, est_delivery_date: null });

    const result = await placeOrderAction({ draftId, idempotencyKey: key, delivery });

    expect(placeCodOrder).toHaveBeenCalledWith(service, {
      draftId,
      customerId: "c1",
      pricing,
      leadDays: 14,
      options: [
        { group: "neck-finish", group_label: "Front / Back Finish", value: "embroidered-front", label: "Embroidered Front", price_delta: 600 },
      ],
      delivery: { full_name: "Ayesha Khan", phone: "0300 1234567", address_line: "House 12, Street 4, Gulberg", city: "Lahore" },
      idempotencyKey: key,
    });
    expect(result).toEqual({ ok: true, data: { number: "MF-2026-000001", mode: "customer" } });
  });

  it("passes the hard-reservation stock error through", async () => {
    vi.mocked(placeCodOrder).mockRejectedValue({ message: "Not enough fabric in stock to confirm this order" });
    const result = await placeOrderAction({ draftId, idempotencyKey: key, delivery });
    expect(result).toEqual({ ok: false, error: "Not enough fabric in stock to confirm this order" });
  });
});

describe("agent ordering for an assigned customer", () => {
  const agentProfile = { id: "agent-p1", role: "agent", status: "active", full_name: "Agent Ali", phone: null, email: "ali@x.test" };
  const agentDraft = () => ctx({ draft: { ...ctx().draft, customer_id: "c1", agent_id: "agent-p1" } });

  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(agentProfile as never);
    vi.mocked(getCurrentAgent).mockResolvedValue({ id: "agent-1", status: "active" } as never);
    vi.mocked(getMyCustomer).mockResolvedValue({ customerId: "c1", fullName: "Sana Khan", phone: "923001234567" });
    vi.mocked(loadAndPriceDraft).mockResolvedValue(agentDraft() as never);
    vi.mocked(hasDraftConsent).mockResolvedValue(false);
    // Earlier tests leave rejecting implementations on these shared mocks.
    vi.mocked(takeSoftReservation).mockResolvedValue({} as never);
    vi.mocked(saveAgentMeasurements).mockResolvedValue({} as never);
  });

  it("refuses another agent's draft", async () => {
    vi.mocked(loadAndPriceDraft).mockResolvedValue(ctx({ draft: { ...ctx().draft, agent_id: "someone-else" } }) as never);
    expect(await getCheckoutAction({ draftId })).toEqual({ ok: false, error: "Draft not found." });
  });

  it("refuses once the customer is no longer assigned to the agent", async () => {
    vi.mocked(getMyCustomer).mockResolvedValue(null);
    expect(await getCheckoutAction({ draftId })).toEqual({ ok: false, error: "This customer isn't assigned to you." });
  });

  it("keeps customer drafts and agent drafts apart", async () => {
    vi.mocked(loadAndPriceDraft).mockResolvedValue(ctx() as never);
    expect((await getCheckoutAction({ draftId })).ok).toBe(false);

    vi.mocked(getCurrentProfile).mockResolvedValue(customer as never);
    vi.mocked(loadAndPriceDraft).mockResolvedValue(agentDraft() as never);
    expect(await getCheckoutAction({ draftId })).toEqual({ ok: false, error: "Draft not found." });
  });

  it("tells the measurement step whether consent is on record", async () => {
    const result = await getMeasurementStepAction({ draftId });
    expect(result).toMatchObject({ ok: true, data: { mode: "agent", consentRecorded: false } });
    expect(hasDraftConsent).toHaveBeenCalledWith(session, draftId);
  });

  it("records consent only with the agent's confirmation", async () => {
    expect((await recordConsentAction({ draftId, method: "in_person", agreed: false } as never)).ok).toBe(false);
    expect(recordConsent).not.toHaveBeenCalled();

    expect(await recordConsentAction({ draftId, method: "in_person", agreed: true })).toEqual({ ok: true, data: { recorded: true } });
    expect(recordConsent).toHaveBeenCalledWith(session, { draftId, method: "in_person" });
  });

  it("doesn't let a customer record agent consent", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(customer as never);
    vi.mocked(loadAndPriceDraft).mockResolvedValue(ctx() as never);
    expect(await recordConsentAction({ draftId, method: "in_person", agreed: true })).toEqual({
      ok: false,
      error: "Only an agent records consent.",
    });
  });

  it("saves the measurements as taken by the agent", async () => {
    const result = await saveMeasurementsAction({ draftId, values: { chest: 96, waist: 80 }, confirmed: true });
    expect(saveAgentMeasurements).toHaveBeenCalledWith(session, { draftId, values: { chest: 96, waist: 80 } });
    expect(saveConfirmedMeasurements).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, data: pricing });
  });

  it("shows the consent message when measurements come before consent", async () => {
    vi.mocked(saveAgentMeasurements).mockRejectedValue({ message: "Record the customer's consent first" });
    const result = await saveMeasurementsAction({ draftId, values: { chest: 96, waist: 80 }, confirmed: true });
    expect(result).toEqual({ ok: false, error: "Record the customer's consent first" });
  });

  it("prefills the delivery form with the customer's details, not the agent's", async () => {
    const result = await getCheckoutAction({ draftId });
    expect(result).toMatchObject({ ok: true, data: { contact: { fullName: "Sana Khan", phone: "+923001234567" }, mode: "agent" } });
  });

  it("places the order for the customer, as the agent", async () => {
    vi.mocked(placeCodOrder).mockResolvedValue({ id: "o1", number: "MF-2026-000009", total: 9920, est_delivery_date: null });
    const result = await placeOrderAction({ draftId, idempotencyKey: key, delivery });
    expect(placeCodOrder).toHaveBeenCalledWith(service, expect.objectContaining({ customerId: "c1", placedBy: "agent-p1" }));
    expect(result).toEqual({ ok: true, data: { number: "MF-2026-000009", mode: "agent" } });
  });
});
