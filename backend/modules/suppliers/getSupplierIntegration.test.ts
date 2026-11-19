import { describe, expect, it } from "vitest";
import { getSupplierIntegration } from "./getSupplierIntegration";
import { listSupplierContacts } from "./listSupplierContacts";
import { providerKindLabel, readCapabilities, type AnySupabaseClient } from "./types";

function readClient(result: { data: unknown; error: { message: string } | null }) {
  const seen: { table?: string; select?: string; eq?: [string, unknown] } = {};
  const b: Record<string, unknown> = {
    select: (cols: string) => {
      seen.select = cols;
      return b;
    },
    eq: (col: string, val: unknown) => {
      seen.eq = [col, val];
      return b;
    },
    order: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  const client = {
    from: (table: string) => {
      seen.table = table;
      return b;
    },
  } as unknown as AnySupabaseClient;
  return { client, seen };
}

describe("getSupplierIntegration", () => {
  it("maps the row and never selects credentials", async () => {
    const { client, seen } = readClient({
      data: {
        supplier_id: "s1",
        provider_kind: "placeholder",
        base_url: null,
        capabilities: { catalogue_read: true, order_write: "true" },
        status: "pending",
        last_sync_at: null,
        updated_at: "2026-11-20T10:00:00Z",
      },
      error: null,
    });
    const result = await getSupplierIntegration(client, "s1");
    expect(seen.table).toBe("supplier_integrations");
    expect(seen.eq).toEqual(["supplier_id", "s1"]);
    expect(seen.select).not.toContain("credentials");
    expect(result).toEqual({
      supplierId: "s1",
      providerKind: "placeholder",
      baseUrl: null,
      capabilities: { catalogue_read: true, stock_read: false, order_write: false, status_callback: false },
      status: "pending",
      lastSyncAt: null,
      updatedAt: "2026-11-20T10:00:00Z",
    });
  });

  it("returns null when the store has no settings yet", async () => {
    const { client } = readClient({ data: null, error: null });
    expect(await getSupplierIntegration(client, "s1")).toBeNull();
  });

  it("throws on a read error", async () => {
    const { client } = readClient({ data: null, error: { message: "boom" } });
    await expect(getSupplierIntegration(client, "s1")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("listSupplierContacts", () => {
  it("maps contacts with their profile", async () => {
    const { client, seen } = readClient({
      data: [
        { user_id: "u1", created_at: "2026-11-20T09:00:00Z", profile: { full_name: "Khaadi Supplier", email: "s@x.pk", status: "active" } },
        { user_id: "u2", created_at: "2026-11-20T09:30:00Z", profile: null },
      ],
      error: null,
    });
    const contacts = await listSupplierContacts(client, "s1");
    expect(seen.table).toBe("supplier_contacts");
    expect(seen.eq).toEqual(["supplier_id", "s1"]);
    expect(contacts).toEqual([
      { userId: "u1", fullName: "Khaadi Supplier", email: "s@x.pk", status: "active", linkedAt: "2026-11-20T09:00:00Z" },
      { userId: "u2", fullName: null, email: null, status: "active", linkedAt: "2026-11-20T09:30:00Z" },
    ]);
  });

  it("throws on a read error", async () => {
    const { client } = readClient({ data: null, error: { message: "boom" } });
    await expect(listSupplierContacts(client, "s1")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("readCapabilities / providerKindLabel", () => {
  it("only counts real true values", () => {
    expect(readCapabilities({ stock_read: true, status_callback: 1 })).toEqual({
      catalogue_read: false,
      stock_read: true,
      order_write: false,
      status_callback: false,
    });
    expect(readCapabilities("nope").catalogue_read).toBe(false);
  });

  it("labels known kinds and passes unknown ones through", () => {
    expect(providerKindLabel("placeholder")).toBe("Placeholder data (demo)");
    expect(providerKindLabel("khadi")).toBe("khadi");
  });
});
