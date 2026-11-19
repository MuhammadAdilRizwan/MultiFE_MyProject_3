import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/active-admin", () => ({ activeAdmin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ service: true })) }));
vi.mock("@multife/backend/modules/suppliers/configureSupplier", () => ({ configureSupplier: vi.fn() }));
vi.mock("@multife/backend/modules/audit/recordAuditEvent", () => ({ recordAuditEvent: vi.fn() }));

import { recordAuditEvent } from "@multife/backend/modules/audit/recordAuditEvent";
import { CatalogError } from "@multife/backend/modules/catalog/errors";
import { configureSupplier } from "@multife/backend/modules/suppliers/configureSupplier";
import { activeAdmin } from "@/lib/active-admin";
import { configureSupplierAction } from "./actions";

const supabase = { session: true };
const STORE = "11111111-1111-4111-8111-111111111111";
const CAPS = { catalogue_read: true, stock_read: false, order_write: false, status_callback: false };
const AFTER = {
  supplierId: STORE,
  providerKind: "api",
  baseUrl: "https://pos.example.pk",
  capabilities: CAPS,
  status: "pending" as const,
  lastSyncAt: null,
  updatedAt: "2026-11-20T10:00:00Z",
};

beforeEach(() => {
  vi.mocked(activeAdmin).mockResolvedValue({ supabase, adminId: "admin-1" } as never);
  vi.mocked(configureSupplier).mockReset().mockResolvedValue({ before: null, after: AFTER });
  vi.mocked(recordAuditEvent).mockReset().mockResolvedValue(undefined);
});

describe("configureSupplierAction", () => {
  it("refuses a non-admin", async () => {
    vi.mocked(activeAdmin).mockResolvedValue(null);
    const result = await configureSupplierAction({ supplierId: STORE, providerKind: "placeholder", capabilities: CAPS });
    expect(result).toEqual({ ok: false, error: "Only an admin can do this." });
    expect(configureSupplier).not.toHaveBeenCalled();
  });

  it("rejects bad input before touching the database", async () => {
    expect((await configureSupplierAction({ supplierId: "nope", providerKind: "placeholder", capabilities: CAPS })).ok).toBe(false);
    expect((await configureSupplierAction({ supplierId: STORE, providerKind: "khadi" as never, capabilities: CAPS })).ok).toBe(false);
    expect(
      (await configureSupplierAction({ supplierId: STORE, providerKind: "api", capabilities: { catalogue_read: true } as never })).ok,
    ).toBe(false);
    expect(configureSupplier).not.toHaveBeenCalled();
  });

  it("saves with the admin's session and audits the change", async () => {
    const result = await configureSupplierAction({
      supplierId: STORE,
      providerKind: "api",
      baseUrl: "https://pos.example.pk",
      capabilities: CAPS,
    });
    expect(result).toEqual({ ok: true, data: AFTER });
    expect(configureSupplier).toHaveBeenCalledWith(supabase, {
      supplierId: STORE,
      providerKind: "api",
      baseUrl: "https://pos.example.pk",
      capabilities: CAPS,
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      { service: true },
      expect.objectContaining({ action: "supplier.configure", actorId: "admin-1", entity: "suppliers", entityId: STORE }),
    );
  });

  it("drops the API address for a non-API connection", async () => {
    await configureSupplierAction({ supplierId: STORE, providerKind: "placeholder", baseUrl: "https://x.pk", capabilities: CAPS });
    expect(vi.mocked(configureSupplier).mock.calls[0][1].baseUrl).toBeNull();
  });

  it("still succeeds when the audit write fails", async () => {
    vi.mocked(recordAuditEvent).mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await configureSupplierAction({ supplierId: STORE, providerKind: "manual", capabilities: CAPS })).ok).toBe(true);
    spy.mockRestore();
  });

  it("shows the module's own validation message", async () => {
    vi.mocked(configureSupplier).mockRejectedValue(
      new CatalogError("invalid_supplier_integration", "The store's API address must be a full https:// link."),
    );
    const result = await configureSupplierAction({ supplierId: STORE, providerKind: "api", baseUrl: "http://x.pk", capabilities: CAPS });
    expect(result).toEqual({ ok: false, error: "The store's API address must be a full https:// link." });
  });
});
