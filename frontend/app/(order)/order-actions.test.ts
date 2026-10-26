import { beforeEach, describe, expect, it, vi } from "vitest";

// Thin Server Actions over already-tested backend modules (orders, catalog,
// rules) — these tests isolate the actions' own logic (Zod validation,
// not-found handling, and the cross-module composition) by mocking every
// collaborator at the boundary, same convention as (storefront)/catalog-actions.test.ts.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/getFabric", () => ({ getFabric: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/getTemplate", () => ({ getTemplate: vi.fn() }));
vi.mock("@multife/backend/modules/rules/evaluateOptions", () => ({ evaluateOptions: vi.fn() }));
vi.mock("@multife/backend/modules/rules/isSelectionSupported", () => ({ isSelectionSupported: vi.fn() }));
vi.mock("@multife/backend/modules/rules/isTemplateCompatibleWithFabric", () => ({
  isTemplateCompatibleWithFabric: vi.fn(),
}));
vi.mock("@multife/backend/modules/rules/estimateYardage", () => ({ estimateYardage: vi.fn() }));
vi.mock("@multife/backend/modules/rules/priceOrder", () => ({ priceOrder: vi.fn() }));
vi.mock("@multife/backend/modules/orders/createDraft", () => ({ createDraft: vi.fn() }));
vi.mock("@multife/backend/modules/orders/getDraft", () => ({ getDraft: vi.fn() }));
vi.mock("@multife/backend/modules/orders/updateDraftOptions", () => ({ updateDraftOptions: vi.fn() }));
vi.mock("@multife/backend/modules/orders/takeSoftReservation", () => ({ takeSoftReservation: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { getFabric } from "@multife/backend/modules/catalog/getFabric";
import { getTemplate } from "@multife/backend/modules/catalog/getTemplate";
import { evaluateOptions } from "@multife/backend/modules/rules/evaluateOptions";
import { isSelectionSupported } from "@multife/backend/modules/rules/isSelectionSupported";
import { isTemplateCompatibleWithFabric } from "@multife/backend/modules/rules/isTemplateCompatibleWithFabric";
import { estimateYardage } from "@multife/backend/modules/rules/estimateYardage";
import { priceOrder } from "@multife/backend/modules/rules/priceOrder";
import { createDraft } from "@multife/backend/modules/orders/createDraft";
import { getDraft } from "@multife/backend/modules/orders/getDraft";
import { updateDraftOptions } from "@multife/backend/modules/orders/updateDraftOptions";
import { takeSoftReservation } from "@multife/backend/modules/orders/takeSoftReservation";
import {
  createDraftAction,
  priceDraftAction,
  takeSoftReservationAction,
  updateDraftOptionsAction,
} from "./order-actions";

const fakeSupabase = {};
const fabricId = "223e4567-e89b-12d3-a456-426614174000";
const templateId = "323e4567-e89b-12d3-a456-426614174000";
const draftId = "423e4567-e89b-12d3-a456-426614174000";

beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue(fakeSupabase as never);
});

describe("createDraftAction", () => {
  it("rejects a non-uuid fabricId", async () => {
    const result = await createDraftAction({ fabricId: "nope", templateId } as never);

    expect(result.ok).toBe(false);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("fails when no customer is signed in", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);

    const result = await createDraftAction({ fabricId, templateId });

    expect(result).toEqual({ ok: false, error: "Sign in as a customer to start an order." });
    expect(getFabric).not.toHaveBeenCalled();
  });

  it("fails when the signed-in profile isn't an active customer", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "agent", status: "active" } as never);

    const result = await createDraftAction({ fabricId, templateId });

    expect(result).toEqual({ ok: false, error: "Sign in as a customer to start an order." });
  });

  it("fails when the fabric doesn't exist", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "active" } as never);
    vi.mocked(getFabric).mockResolvedValue(null);

    const result = await createDraftAction({ fabricId, templateId });

    expect(result).toEqual({ ok: false, error: "Fabric not found." });
  });

  it("fails when the template doesn't exist", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "active" } as never);
    vi.mocked(getFabric).mockResolvedValue({ id: fabricId, supported_options: {} } as never);
    vi.mocked(getTemplate).mockResolvedValue(null);

    const result = await createDraftAction({ fabricId, templateId });

    expect(result).toEqual({ ok: false, error: "Template not found." });
  });

  it("fails when the template isn't compatible with the fabric", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "active" } as never);
    vi.mocked(getFabric).mockResolvedValue({ id: fabricId, supported_options: {} } as never);
    vi.mocked(getTemplate).mockResolvedValue({ id: templateId, options: [] } as never);
    vi.mocked(isTemplateCompatibleWithFabric).mockReturnValue(false);

    const result = await createDraftAction({ fabricId, templateId });

    expect(result).toEqual({ ok: false, error: "This template isn't available in the chosen fabric." });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("creates the draft for the signed-in customer", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "active" } as never);
    vi.mocked(getFabric).mockResolvedValue({ id: fabricId, supported_options: {} } as never);
    vi.mocked(getTemplate).mockResolvedValue({ id: templateId, options: [] } as never);
    vi.mocked(isTemplateCompatibleWithFabric).mockReturnValue(true);
    vi.mocked(createDraft).mockResolvedValue({ id: draftId } as never);

    const result = await createDraftAction({ fabricId, templateId });

    expect(createDraft).toHaveBeenCalledWith(fakeSupabase, { customerId: "c1", fabricId, templateId });
    expect(result).toEqual({ ok: true, data: { id: draftId } });
  });
});

describe("updateDraftOptionsAction", () => {
  it("fails when the draft doesn't exist", async () => {
    vi.mocked(getDraft).mockResolvedValue(null);

    const result = await updateDraftOptionsAction({ draftId, options: {} });

    expect(result).toEqual({ ok: false, error: "Draft not found." });
    expect(updateDraftOptions).not.toHaveBeenCalled();
  });

  it("fails when the selection isn't supported by the fabric/template", async () => {
    vi.mocked(getDraft).mockResolvedValue({ id: draftId, fabric_id: fabricId, template_id: templateId } as never);
    vi.mocked(getFabric).mockResolvedValue({ id: fabricId, supported_options: {} } as never);
    vi.mocked(getTemplate).mockResolvedValue({ id: templateId, options: [] } as never);
    vi.mocked(evaluateOptions).mockReturnValue([]);
    vi.mocked(isSelectionSupported).mockReturnValue(false);

    const result = await updateDraftOptionsAction({ draftId, options: { sleeve: "full" } });

    expect(result).toEqual({ ok: false, error: "One or more selected options aren't supported by this fabric." });
    expect(updateDraftOptions).not.toHaveBeenCalled();
  });

  it("updates the draft when the selection is supported", async () => {
    vi.mocked(getDraft).mockResolvedValue({ id: draftId, fabric_id: fabricId, template_id: templateId } as never);
    vi.mocked(getFabric).mockResolvedValue({ id: fabricId, supported_options: {} } as never);
    vi.mocked(getTemplate).mockResolvedValue({ id: templateId, options: [] } as never);
    vi.mocked(evaluateOptions).mockReturnValue([]);
    vi.mocked(isSelectionSupported).mockReturnValue(true);
    vi.mocked(updateDraftOptions).mockResolvedValue({ id: draftId, options: { sleeve: "full" } } as never);

    const result = await updateDraftOptionsAction({ draftId, options: { sleeve: "full" } });

    expect(updateDraftOptions).toHaveBeenCalledWith(fakeSupabase, draftId, { sleeve: "full" });
    expect(result).toEqual({ ok: true, data: { id: draftId, options: { sleeve: "full" } } });
  });
});

describe("priceDraftAction", () => {
  it("fails when the draft doesn't exist", async () => {
    vi.mocked(getDraft).mockResolvedValue(null);

    const result = await priceDraftAction({ draftId });

    expect(result).toEqual({ ok: false, error: "Draft not found." });
  });

  it("fails when the draft has no fabric/template chosen yet", async () => {
    vi.mocked(getDraft).mockResolvedValue({ id: draftId, fabric_id: null, template_id: null } as never);

    const result = await priceDraftAction({ draftId });

    expect(result).toEqual({ ok: false, error: "Pick a fabric and template first." });
  });

  it("derives nominal measurements from the template's required fields and prices the draft", async () => {
    vi.mocked(getDraft).mockResolvedValue({
      id: draftId,
      fabric_id: fabricId,
      template_id: templateId,
      options: { sleeve: "full" },
    } as never);
    vi.mocked(getFabric).mockResolvedValue({
      id: fabricId,
      price_per_metre: 900,
      properties: { directional_pattern: true },
      supported_options: {},
    } as never);
    vi.mocked(getTemplate).mockResolvedValue({
      id: templateId,
      base_stitch_price: 2500,
      yardage_formula: { base_metres: 4.5, coefficients: {}, wastage_margin: 0.1 },
      required_measurements: [{ key: "chest", label: "Chest", unit: "cm", min: 60, max: 160 }],
      options: [],
    } as never);
    vi.mocked(evaluateOptions).mockReturnValue([]);
    vi.mocked(estimateYardage).mockReturnValue(5.2);
    vi.mocked(priceOrder).mockReturnValue({
      yardageMetres: 5.2,
      fabricCost: 4680,
      stitchCost: 2500,
      optionsCost: 0,
      total: 7180,
    });

    const result = await priceDraftAction({ draftId });

    expect(estimateYardage).toHaveBeenCalledWith({
      yardageFormula: { base_metres: 4.5, coefficients: {}, wastage_margin: 0.1 },
      measurements: { chest: 110 },
      selection: { sleeve: "full" },
      fabricHasDirectionalPattern: true,
    });
    expect(priceOrder).toHaveBeenCalledWith({
      fabricPricePerMetre: 900,
      templateBaseStitchPrice: 2500,
      yardageMetres: 5.2,
      evaluatedOptions: [],
      selection: { sleeve: "full" },
    });
    expect(result).toEqual({
      ok: true,
      data: { yardageMetres: 5.2, fabricCost: 4680, stitchCost: 2500, optionsCost: 0, total: 7180 },
    });
  });
});

describe("takeSoftReservationAction", () => {
  it("fails when the draft doesn't exist", async () => {
    vi.mocked(getDraft).mockResolvedValue(null);

    const result = await takeSoftReservationAction({ draftId });

    expect(result).toEqual({ ok: false, error: "Draft not found." });
    expect(takeSoftReservation).not.toHaveBeenCalled();
  });

  it("re-prices the draft and takes a soft reservation for the computed yardage", async () => {
    vi.mocked(getDraft).mockResolvedValue({
      id: draftId,
      fabric_id: fabricId,
      template_id: templateId,
      options: {},
    } as never);
    vi.mocked(getFabric).mockResolvedValue({
      id: fabricId,
      price_per_metre: 900,
      properties: {},
      supported_options: {},
    } as never);
    vi.mocked(getTemplate).mockResolvedValue({
      id: templateId,
      base_stitch_price: 2500,
      yardage_formula: { base_metres: 4.5, coefficients: {}, wastage_margin: 0.1 },
      required_measurements: [],
      options: [],
    } as never);
    vi.mocked(evaluateOptions).mockReturnValue([]);
    vi.mocked(estimateYardage).mockReturnValue(4.5);
    vi.mocked(priceOrder).mockReturnValue({
      yardageMetres: 4.5,
      fabricCost: 4050,
      stitchCost: 2500,
      optionsCost: 0,
      total: 6550,
    });
    vi.mocked(takeSoftReservation).mockResolvedValue({ id: "r1", kind: "soft", status: "active" } as never);

    const result = await takeSoftReservationAction({ draftId });

    expect(takeSoftReservation).toHaveBeenCalledWith(fakeSupabase, { draftId, fabricId, metres: 4.5 });
    expect(result).toEqual({ ok: true, data: { id: "r1", kind: "soft", status: "active" } });
  });
});
