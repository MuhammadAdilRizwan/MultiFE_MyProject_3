import { beforeEach, describe, expect, it, vi } from "vitest";

// Thin Server Actions over already-tested backend modules — these tests
// isolate the actions' own logic (Zod validation, not-found handling, and
// the two-module composition in the last two actions) by mocking every
// collaborator at the boundary.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/listFabrics", () => ({ listFabrics: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/getFabric", () => ({ getFabric: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/listTemplates", () => ({ listTemplates: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/getTemplate", () => ({ getTemplate: vi.fn() }));
vi.mock("@multife/backend/modules/rules/evaluateOptions", () => ({ evaluateOptions: vi.fn() }));
vi.mock("@multife/backend/modules/rules/isTemplateCompatibleWithFabric", () => ({
  isTemplateCompatibleWithFabric: vi.fn(),
}));
vi.mock("@/lib/suppliers", () => ({ getActiveBrandBySlug: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { listFabrics } from "@multife/backend/modules/catalog/listFabrics";
import { getFabric } from "@multife/backend/modules/catalog/getFabric";
import { listTemplates } from "@multife/backend/modules/catalog/listTemplates";
import { getTemplate } from "@multife/backend/modules/catalog/getTemplate";
import { evaluateOptions } from "@multife/backend/modules/rules/evaluateOptions";
import { isTemplateCompatibleWithFabric } from "@multife/backend/modules/rules/isTemplateCompatibleWithFabric";
import { getActiveBrandBySlug } from "@/lib/suppliers";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import {
  getFabricAction,
  getOrderContextAction,
  getTemplateAction,
  getTemplateOptionsForFabricAction,
  listCompatibleTemplatesForFabricAction,
  listFabricsAction,
  listStoreFabricsAction,
  listTemplatesAction,
} from "./catalog-actions";

const fakeSupabase = {};

beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue(fakeSupabase as never);
});

describe("listFabricsAction", () => {
  it("rejects a non-uuid supplierId", async () => {
    const result = await listFabricsAction({ supplierId: "not-a-uuid" });

    expect(result.ok).toBe(false);
    expect(listFabrics).not.toHaveBeenCalled();
  });

  it("returns the fabrics", async () => {
    vi.mocked(listFabrics).mockResolvedValue([{ id: "f1", name: "Raw silk" } as never]);

    const result = await listFabricsAction({});

    expect(result).toEqual({ ok: true, data: [{ id: "f1", name: "Raw silk" }] });
  });
});

describe("getFabricAction", () => {
  it("rejects a missing fabricId", async () => {
    const result = await getFabricAction({} as never);

    expect(result.ok).toBe(false);
    expect(getFabric).not.toHaveBeenCalled();
  });

  it("fails when the fabric doesn't exist", async () => {
    vi.mocked(getFabric).mockResolvedValue(null);

    const result = await getFabricAction({ fabricId: "123e4567-e89b-12d3-a456-426614174000" });

    expect(result).toEqual({ ok: false, error: "Fabric not found." });
  });

  it("returns the fabric", async () => {
    vi.mocked(getFabric).mockResolvedValue({ id: "f1", images: [] } as never);

    const result = await getFabricAction({ fabricId: "123e4567-e89b-12d3-a456-426614174000" });

    expect(result).toEqual({ ok: true, data: { id: "f1", images: [] } });
  });
});

describe("listTemplatesAction", () => {
  it("returns the templates", async () => {
    vi.mocked(listTemplates).mockResolvedValue([{ id: "t1" } as never]);

    expect(await listTemplatesAction()).toEqual({ ok: true, data: [{ id: "t1" }] });
  });
});

describe("getTemplateAction", () => {
  it("fails when the template doesn't exist", async () => {
    vi.mocked(getTemplate).mockResolvedValue(null);

    const result = await getTemplateAction({ templateId: "123e4567-e89b-12d3-a456-426614174000" });

    expect(result).toEqual({ ok: false, error: "Template not found." });
  });
});

describe("getTemplateOptionsForFabricAction", () => {
  const templateId = "123e4567-e89b-12d3-a456-426614174000";
  const fabricId = "223e4567-e89b-12d3-a456-426614174000";

  it("fails when the template doesn't exist", async () => {
    vi.mocked(getTemplate).mockResolvedValue(null);

    const result = await getTemplateOptionsForFabricAction({ templateId, fabricId });

    expect(result).toEqual({ ok: false, error: "Template not found." });
    expect(getFabric).not.toHaveBeenCalled();
  });

  it("fails when the fabric doesn't exist", async () => {
    vi.mocked(getTemplate).mockResolvedValue({ id: templateId, options: [] } as never);
    vi.mocked(getFabric).mockResolvedValue(null);

    const result = await getTemplateOptionsForFabricAction({ templateId, fabricId });

    expect(result).toEqual({ ok: false, error: "Fabric not found." });
  });

  it("maps the template's options and the fabric's supported_options into evaluateOptions, and returns its result", async () => {
    vi.mocked(getTemplate).mockResolvedValue({
      id: templateId,
      options: [
        {
          group: { key: "cuff", label: "Cuff" },
          value: { key: "soft", label: "Soft" },
          price_delta: 0,
          extra_lead_days: 0,
          is_default: true,
        },
      ],
    } as never);
    vi.mocked(getFabric).mockResolvedValue({ id: fabricId, supported_options: { cuff: ["soft"] } } as never);
    vi.mocked(evaluateOptions).mockReturnValue([{ groupKey: "cuff", groupLabel: "Cuff", values: [] }]);

    const result = await getTemplateOptionsForFabricAction({ templateId, fabricId });

    expect(evaluateOptions).toHaveBeenCalledWith(
      [{ groupKey: "cuff", groupLabel: "Cuff", valueKey: "soft", valueLabel: "Soft", priceDelta: 0, extraLeadDays: 0, isDefault: true }],
      { cuff: ["soft"] },
    );
    expect(result).toEqual({
      ok: true,
      data: { templateId, fabricId, options: [{ groupKey: "cuff", groupLabel: "Cuff", values: [] }] },
    });
  });
});

describe("listCompatibleTemplatesForFabricAction", () => {
  const fabricId = "223e4567-e89b-12d3-a456-426614174000";

  it("fails when the fabric doesn't exist", async () => {
    vi.mocked(getFabric).mockResolvedValue(null);

    const result = await listCompatibleTemplatesForFabricAction({ fabricId });

    expect(result).toEqual({ ok: false, error: "Fabric not found." });
    expect(listTemplates).not.toHaveBeenCalled();
  });

  it("returns only the templates isTemplateCompatibleWithFabric accepts", async () => {
    vi.mocked(getFabric).mockResolvedValue({ id: fabricId, supported_options: { cuff: ["soft"] } } as never);
    vi.mocked(listTemplates).mockResolvedValue([{ id: "t1" }, { id: "t2" }] as never);
    vi.mocked(getTemplate).mockImplementation(async (_supabase, id) =>
      ({ id, options: [] }) as never,
    );
    vi.mocked(isTemplateCompatibleWithFabric).mockReturnValueOnce(true).mockReturnValueOnce(false);

    const result = await listCompatibleTemplatesForFabricAction({ fabricId });

    expect(result).toEqual({ ok: true, data: [{ id: "t1" }] });
  });
});

describe("listStoreFabricsAction", () => {
  const supplierId = "123e4567-e89b-12d3-a456-426614174000";

  it("keeps only orderable fabrics and attaches each one's first image", async () => {
    vi.mocked(listFabrics).mockResolvedValue([
      { id: "f1", is_available: true, is_hidden: false },
      { id: "f2", is_available: false, is_hidden: false },
      { id: "f3", is_available: true, is_hidden: true },
      { id: "f4", is_available: true, is_hidden: false },
    ] as never);
    const order = vi.fn().mockResolvedValue({
      data: [
        { fabric_id: "f1", url: "https://x/1a.webp", sort: 0 },
        { fabric_id: "f1", url: "https://x/1b.webp", sort: 1 },
      ],
      error: null,
    });
    const inFilter = vi.fn(() => ({ order }));
    vi.mocked(createClient).mockResolvedValue({ from: () => ({ select: () => ({ in: inFilter }) }) } as never);

    const result = await listStoreFabricsAction({ supplierId });

    expect(inFilter).toHaveBeenCalledWith("fabric_id", ["f1", "f4"]);
    expect(result).toEqual({
      ok: true,
      data: [
        { id: "f1", is_available: true, is_hidden: false, coverImage: "https://x/1a.webp" },
        { id: "f4", is_available: true, is_hidden: false, coverImage: null },
      ],
    });
  });

  it("rejects a non-uuid supplierId", async () => {
    const result = await listStoreFabricsAction({ supplierId: "khadi" });

    expect(result.ok).toBe(false);
  });
});

describe("getOrderContextAction", () => {
  const brand = { id: "s1", name: "Khadi", slug: "khadi", logoUrl: null, brandColor: null };
  const fabricId = "123e4567-e89b-12d3-a456-426614174000";
  const templateId = "223e4567-e89b-12d3-a456-426614174000";
  const fabric = { id: fabricId, supplier_id: "s1", is_available: true, is_hidden: false, supported_options: { neckline: ["round"] }, images: [] };

  beforeEach(() => {
    vi.mocked(getActiveBrandBySlug).mockResolvedValue(brand);
    vi.mocked(getFabric).mockResolvedValue(fabric as never);
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
  });

  it("fails when the store isn't live", async () => {
    vi.mocked(getActiveBrandBySlug).mockResolvedValue(null);

    const result = await getOrderContextAction({ brandSlug: "khadi", fabricId });

    expect(result).toEqual({ ok: false, error: "Store not found." });
  });

  it("fails when the fabric belongs to another store", async () => {
    vi.mocked(getFabric).mockResolvedValue({ ...fabric, supplier_id: "s2" } as never);

    const result = await getOrderContextAction({ brandSlug: "khadi", fabricId });

    expect(result).toEqual({ ok: false, error: "Fabric not found." });
  });

  it("fails when the fabric is no longer available", async () => {
    vi.mocked(getFabric).mockResolvedValue({ ...fabric, is_available: false } as never);

    const result = await getOrderContextAction({ brandSlug: "khadi", fabricId });

    expect(result).toEqual({ ok: false, error: "Fabric not found." });
  });

  it("returns brand and fabric with no options before a template is chosen", async () => {
    vi.mocked(getTemplate).mockClear();

    const result = await getOrderContextAction({ brandSlug: "khadi", fabricId, templateId: null });

    expect(result).toEqual({ ok: true, data: { brand, fabric, template: null, options: [], isCustomer: false } });
    expect(getTemplate).not.toHaveBeenCalled();
  });

  it("fails for an unpublished template", async () => {
    vi.mocked(getTemplate).mockResolvedValue({ id: templateId, is_published: false, options: [] } as never);

    const result = await getOrderContextAction({ brandSlug: "khadi", fabricId, templateId });

    expect(result).toEqual({ ok: false, error: "Template not found." });
  });

  it("evaluates the template's options against the fabric", async () => {
    vi.mocked(getTemplate).mockResolvedValue({ id: templateId, name: "Kurti", is_published: true, options: [] } as never);
    const evaluated = [{ groupKey: "neckline", groupLabel: "Neckline", values: [] }];
    vi.mocked(evaluateOptions).mockReturnValue(evaluated);

    const result = await getOrderContextAction({ brandSlug: "khadi", fabricId, templateId });

    expect(evaluateOptions).toHaveBeenCalledWith([], { neckline: ["round"] });
    expect(result).toEqual({
      ok: true,
      data: { brand, fabric, template: { id: templateId, name: "Kurti", is_published: true }, options: evaluated, isCustomer: false },
    });
  });

  it("marks an active signed-in customer, who gets a database draft", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "active" } as never);

    const result = await getOrderContextAction({ brandSlug: "khadi", fabricId });

    expect(result.ok && result.data.isCustomer).toBe(true);
  });

  it("does not treat an admin as a customer", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "a1", role: "admin", status: "active" } as never);

    const result = await getOrderContextAction({ brandSlug: "khadi", fabricId });

    expect(result.ok && result.data.isCustomer).toBe(false);
  });
});
