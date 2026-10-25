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

import { createClient } from "@/lib/supabase/server";
import { listFabrics } from "@multife/backend/modules/catalog/listFabrics";
import { getFabric } from "@multife/backend/modules/catalog/getFabric";
import { listTemplates } from "@multife/backend/modules/catalog/listTemplates";
import { getTemplate } from "@multife/backend/modules/catalog/getTemplate";
import { evaluateOptions } from "@multife/backend/modules/rules/evaluateOptions";
import { isTemplateCompatibleWithFabric } from "@multife/backend/modules/rules/isTemplateCompatibleWithFabric";
import {
  getFabricAction,
  getTemplateAction,
  getTemplateOptionsForFabricAction,
  listCompatibleTemplatesForFabricAction,
  listFabricsAction,
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
