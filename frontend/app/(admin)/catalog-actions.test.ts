import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/createSupplier", () => ({ createSupplier: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/setSupplierStatus", () => ({ setSupplierStatus: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/createTemplate", () => ({ createTemplate: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/updateTemplate", () => ({ updateTemplate: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/setTemplatePublished", () => ({ setTemplatePublished: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/createOptionGroup", () => ({ createOptionGroup: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/createOptionValue", () => ({ createOptionValue: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/createTemplateOption", () => ({ createTemplateOption: vi.fn() }));
vi.mock("@multife/backend/modules/catalog/setFabricAvailability", () => ({ setFabricAvailability: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { createSupplier } from "@multife/backend/modules/catalog/createSupplier";
import { setSupplierStatus } from "@multife/backend/modules/catalog/setSupplierStatus";
import { createTemplate } from "@multife/backend/modules/catalog/createTemplate";
import { updateTemplate } from "@multife/backend/modules/catalog/updateTemplate";
import { setTemplatePublished } from "@multife/backend/modules/catalog/setTemplatePublished";
import { createOptionGroup } from "@multife/backend/modules/catalog/createOptionGroup";
import { createOptionValue } from "@multife/backend/modules/catalog/createOptionValue";
import { createTemplateOption } from "@multife/backend/modules/catalog/createTemplateOption";
import { setFabricAvailability } from "@multife/backend/modules/catalog/setFabricAvailability";
import {
  createOptionGroupAction,
  createOptionValueAction,
  createSupplierAction,
  createTemplateAction,
  createTemplateOptionAction,
  setFabricAvailabilityAction,
  setSupplierStatusAction,
  setTemplatePublishedAction,
  updateTemplateAction,
} from "./catalog-actions";

const fakeSupabase = {};
const activeAdmin = { id: "a1", role: "admin" as const, full_name: null, phone: null, email: null, status: "active" as const };

beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue(fakeSupabase as never);
  vi.mocked(getCurrentProfile).mockResolvedValue(activeAdmin);
});

describe("admin gate", () => {
  it("createSupplierAction rejects a non-admin", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeAdmin, role: "tailor" });

    const result = await createSupplierAction({ name: "Khadi", slug: "khadi" });

    expect(result.ok).toBe(false);
    expect(createSupplier).not.toHaveBeenCalled();
  });

  it("setFabricAvailabilityAction rejects a suspended admin", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeAdmin, status: "suspended" });

    const result = await setFabricAvailabilityAction({ fabricId: "123e4567-e89b-12d3-a456-426614174000", isAvailable: true });

    expect(result.ok).toBe(false);
    expect(setFabricAvailability).not.toHaveBeenCalled();
  });
});

describe("createSupplierAction", () => {
  it("rejects an invalid slug", async () => {
    const result = await createSupplierAction({ name: "Khadi", slug: "Not A Slug" });

    expect(result.ok).toBe(false);
    expect(createSupplier).not.toHaveBeenCalled();
  });

  it("creates the supplier on success", async () => {
    vi.mocked(createSupplier).mockResolvedValue({ id: "s1", name: "Khadi", slug: "khadi", status: "pending", logo_url: null, brand_color: null, contact: {} });

    const result = await createSupplierAction({ name: "Khadi", slug: "khadi" });

    expect(result).toEqual({ ok: true, data: { id: "s1", name: "Khadi", slug: "khadi", status: "pending", logo_url: null, brand_color: null, contact: {} } });
  });
});

describe("setSupplierStatusAction", () => {
  it("rejects an invalid status", async () => {
    const result = await setSupplierStatusAction({ supplierId: "123e4567-e89b-12d3-a456-426614174000", status: "live" as never });

    expect(result.ok).toBe(false);
    expect(setSupplierStatus).not.toHaveBeenCalled();
  });

  it("calls through on success", async () => {
    vi.mocked(setSupplierStatus).mockResolvedValue(undefined);

    const result = await setSupplierStatusAction({ supplierId: "123e4567-e89b-12d3-a456-426614174000", status: "active" });

    expect(setSupplierStatus).toHaveBeenCalledWith(fakeSupabase, "123e4567-e89b-12d3-a456-426614174000", "active");
    expect(result).toEqual({ ok: true, data: null });
  });
});

describe("createTemplateAction", () => {
  it("rejects a missing name", async () => {
    const result = await createTemplateAction({ slug: "x" } as never);

    expect(result.ok).toBe(false);
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it("creates the template on success", async () => {
    vi.mocked(createTemplate).mockResolvedValue({ id: "t1" } as never);

    const result = await createTemplateAction({ name: "Classic kurta", slug: "classic-kurta" });

    expect(result).toEqual({ ok: true, data: { id: "t1" } });
  });
});

describe("updateTemplateAction", () => {
  it("calls through with only the given fields", async () => {
    vi.mocked(updateTemplate).mockResolvedValue(undefined);

    const result = await updateTemplateAction({ templateId: "123e4567-e89b-12d3-a456-426614174000", leadDays: 5 });

    expect(updateTemplate).toHaveBeenCalledWith(fakeSupabase, "123e4567-e89b-12d3-a456-426614174000", { leadDays: 5 });
    expect(result).toEqual({ ok: true, data: null });
  });
});

describe("setTemplatePublishedAction", () => {
  it("calls through on success", async () => {
    vi.mocked(setTemplatePublished).mockResolvedValue(undefined);

    const result = await setTemplatePublishedAction({ templateId: "123e4567-e89b-12d3-a456-426614174000", isPublished: true });

    expect(result).toEqual({ ok: true, data: null });
  });
});

describe("createOptionGroupAction", () => {
  it("creates the group on success", async () => {
    vi.mocked(createOptionGroup).mockResolvedValue({ id: "g1", key: "cuff", label: "Cuff", sort: 0 });

    const result = await createOptionGroupAction({ key: "cuff", label: "Cuff" });

    expect(result).toEqual({ ok: true, data: { id: "g1", key: "cuff", label: "Cuff", sort: 0 } });
  });
});

describe("createOptionValueAction", () => {
  it("rejects a missing groupId", async () => {
    const result = await createOptionValueAction({ key: "soft", label: "Soft" } as never);

    expect(result.ok).toBe(false);
    expect(createOptionValue).not.toHaveBeenCalled();
  });

  it("creates the value on success", async () => {
    vi.mocked(createOptionValue).mockResolvedValue({ id: "v1", group_id: "g1", key: "soft", label: "Soft", image_url: null, sort: 0 });

    const result = await createOptionValueAction({ groupId: "123e4567-e89b-12d3-a456-426614174000", key: "soft", label: "Soft" });

    expect(result.ok).toBe(true);
  });
});

describe("createTemplateOptionAction", () => {
  it("creates the template option on success", async () => {
    vi.mocked(createTemplateOption).mockResolvedValue({
      id: "o1",
      template_id: "t1",
      group_id: "g1",
      value_id: "v1",
      price_delta: 0,
      extra_lead_days: 0,
      is_default: false,
    });

    const result = await createTemplateOptionAction({
      templateId: "123e4567-e89b-12d3-a456-426614174000",
      groupId: "223e4567-e89b-12d3-a456-426614174000",
      valueId: "323e4567-e89b-12d3-a456-426614174000",
    });

    expect(result.ok).toBe(true);
  });
});

describe("setFabricAvailabilityAction", () => {
  it("calls through on success", async () => {
    vi.mocked(setFabricAvailability).mockResolvedValue(undefined);

    const result = await setFabricAvailabilityAction({ fabricId: "123e4567-e89b-12d3-a456-426614174000", isAvailable: true });

    expect(result).toEqual({ ok: true, data: null });
  });

  it("surfaces the CatalogError message when the publish gate rejects it", async () => {
    class FakeCatalogError extends Error {
      code = "fabric_not_publishable";
    }
    vi.mocked(setFabricAvailability).mockRejectedValue(new FakeCatalogError("no supported options"));

    const result = await setFabricAvailabilityAction({ fabricId: "123e4567-e89b-12d3-a456-426614174000", isAvailable: true });

    expect(result).toEqual({ ok: false, error: "no supported options" });
  });
});
