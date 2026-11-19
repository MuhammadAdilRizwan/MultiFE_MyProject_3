import { describe, expect, it } from "vitest";
import { configureSupplier } from "./configureSupplier";
import type { AnySupabaseClient } from "./types";

const ROW = {
  supplier_id: "s1",
  provider_kind: "placeholder",
  base_url: null,
  capabilities: { catalogue_read: false, stock_read: false, order_write: false, status_callback: false },
  status: "pending",
  last_sync_at: null,
  updated_at: "2026-11-20T10:00:00Z",
};

// Fakes the two calls: the "before" read (select … maybeSingle) and the upsert
// (upsert … select … single).
function fakeClient({ before = null as unknown, upsertError = null as { message: string } | null } = {}) {
  const calls: { upsert?: Record<string, unknown>; onConflict?: string; selects: string[] } = { selects: [] };
  const client = {
    from: (table: string) => {
      expect(table).toBe("supplier_integrations");
      const b: Record<string, unknown> = {
        select: (cols: string) => {
          calls.selects.push(cols);
          return b;
        },
        eq: () => b,
        maybeSingle: () => Promise.resolve({ data: before, error: null }),
        upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => {
          calls.upsert = row;
          calls.onConflict = opts.onConflict;
          return b;
        },
        single: () =>
          Promise.resolve(
            upsertError ? { data: null, error: upsertError } : { data: { ...ROW, ...calls.upsert }, error: null },
          ),
      };
      return b;
    },
  } as unknown as AnySupabaseClient;
  return { client, calls };
}

const caps = { catalogue_read: true, stock_read: false, order_write: false, status_callback: false };

describe("configureSupplier", () => {
  it("upserts one row per store and returns before/after", async () => {
    const { client, calls } = fakeClient({ before: ROW });

    const result = await configureSupplier(client, {
      supplierId: "s1",
      providerKind: "api",
      baseUrl: "  https://pos.example.pk/v1 ",
      capabilities: caps,
    });

    expect(calls.onConflict).toBe("supplier_id");
    expect(calls.upsert).toEqual({
      supplier_id: "s1",
      provider_kind: "api",
      base_url: "https://pos.example.pk/v1",
      capabilities: caps,
    });
    expect(result.before?.providerKind).toBe("placeholder");
    expect(result.after).toMatchObject({ providerKind: "api", baseUrl: "https://pos.example.pk/v1", capabilities: caps });
  });

  it("never reads or writes credentials, status or last sync", async () => {
    const { client, calls } = fakeClient();
    await configureSupplier(client, { supplierId: "s1", providerKind: "placeholder", capabilities: caps });

    expect(Object.keys(calls.upsert ?? {})).not.toContain("credentials_ref");
    expect(Object.keys(calls.upsert ?? {})).not.toContain("status");
    expect(Object.keys(calls.upsert ?? {})).not.toContain("last_sync_at");
    for (const cols of calls.selects) expect(cols).not.toContain("credentials");
  });

  it("stores an empty address as null and coerces capabilities to booleans", async () => {
    const { client, calls } = fakeClient();
    await configureSupplier(client, {
      supplierId: "s1",
      providerKind: "manual",
      baseUrl: "   ",
      capabilities: { catalogue_read: "yes", stock_read: 1, order_write: true, status_callback: null } as never,
    });
    expect(calls.upsert?.base_url).toBeNull();
    expect(calls.upsert?.capabilities).toEqual({ catalogue_read: false, stock_read: false, order_write: true, status_callback: false });
  });

  it("refuses a non-https or malformed address", async () => {
    for (const baseUrl of ["http://pos.example.pk", "ftp://pos.example.pk", "not a url", "https://user:pw@pos.example.pk", "https://localhost"]) {
      const { client, calls } = fakeClient();
      await expect(configureSupplier(client, { supplierId: "s1", providerKind: "api", baseUrl, capabilities: caps })).rejects.toThrow(
        /https/,
      );
      expect(calls.upsert).toBeUndefined();
    }
  });

  it("refuses an unknown connection type", async () => {
    const { client } = fakeClient();
    await expect(
      configureSupplier(client, { supplierId: "s1", providerKind: "khadi" as never, capabilities: caps }),
    ).rejects.toThrow("Unknown connection type.");
  });

  it("throws when the write fails", async () => {
    const { client } = fakeClient({ upsertError: { message: "permission denied" } });
    await expect(configureSupplier(client, { supplierId: "s1", providerKind: "manual", capabilities: caps })).rejects.toMatchObject({
      message: "permission denied",
    });
  });
});
