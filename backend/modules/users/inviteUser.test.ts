import { describe, expect, it, vi } from "vitest";
import {
  inviteUser,
  inviteAdmin,
  inviteAgent,
  inviteProductionStaff,
  inviteSupplierContact,
} from "./inviteUser";
import type { AnySupabaseClient } from "./types";

// Unlike the shared tests/support/queryBuilder, this one records what was
// passed to .insert()/.update() so tests can assert on the linking-row
// payload, not just the final { data, error }.
function recordingBuilder(result: { data?: unknown; error?: unknown } = {}) {
  const value = { data: result.data ?? null, error: result.error ?? null };
  const calls: { insert?: unknown; update?: unknown } = {};
  const builder: Record<string, unknown> = {
    update: (v: unknown) => {
      calls.update = v;
      return builder;
    },
    insert: (v: unknown) => {
      calls.insert = v;
      return builder;
    },
    eq: () => builder,
    single: () => Promise.resolve(value),
    maybeSingle: () => Promise.resolve(value),
    then: (onFulfilled: (v: typeof value) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(value).then(onFulfilled, onRejected),
  };
  return { builder, calls };
}

function fakeAdminClient(opts: {
  inviteError?: { message: string };
  tableErrors?: Record<string, { message: string }>;
}) {
  const userId = "u1";
  const inviteUserByEmail = vi.fn(async () =>
    opts.inviteError
      ? { data: { user: null }, error: opts.inviteError }
      : { data: { user: { id: userId } }, error: null },
  );
  const updateUserById = vi.fn(async () => ({ error: null }));
  const deleteUser = vi.fn(async () => ({ error: null }));

  const tables: Record<string, ReturnType<typeof recordingBuilder>> = {};
  const from = vi.fn((table: string) => {
    if (!tables[table]) {
      tables[table] = recordingBuilder(opts.tableErrors?.[table] ? { error: opts.tableErrors[table] } : {});
    }
    return tables[table].builder;
  });

  const client = { auth: { admin: { inviteUserByEmail, updateUserById, deleteUser } }, from };

  return { client: client as unknown as AnySupabaseClient, inviteUserByEmail, updateUserById, deleteUser, tables };
}

describe("inviteUser", () => {
  it("invites an admin: sets the role and app_metadata, with no linking row", async () => {
    const { client, updateUserById, tables } = fakeAdminClient({});

    const result = await inviteUser(
      client,
      { role: "admin", email: "a@x.com", fullName: "Admin A" },
      "https://app/auth/callback",
    );

    expect(result.userId).toBe("u1");
    expect(tables.profiles.calls.update).toEqual({ role: "admin" });
    expect(tables.agents).toBeUndefined();
    expect(tables.supplier_contacts).toBeUndefined();
    expect(updateUserById).toHaveBeenCalledWith("u1", { app_metadata: { role: "admin" } });
  });

  it("invites an agent: creates the agents row, defaulting the code when none is given", async () => {
    const { client, tables } = fakeAdminClient({});

    await inviteUser(client, { role: "agent", email: "a@x.com" }, "https://app/auth/callback");

    expect(tables.agents.calls.insert).toMatchObject({ profile_id: "u1", region: null });
    expect((tables.agents.calls.insert as { code: string }).code).toMatch(/^AG-/);
  });

  it("invites an agent: uses the given code and region when provided", async () => {
    const { client, tables } = fakeAdminClient({});

    await inviteUser(
      client,
      { role: "agent", email: "a@x.com", agentCode: "AG-NORTH-1", region: "North" },
      "https://app/auth/callback",
    );

    expect(tables.agents.calls.insert).toEqual({ profile_id: "u1", code: "AG-NORTH-1", region: "North" });
  });

  it("invites a supplier_contact: creates the linking row and sets supplier_id on app_metadata", async () => {
    const { client, tables, updateUserById } = fakeAdminClient({});

    await inviteUser(
      client,
      { role: "supplier_contact", email: "s@x.com", supplierId: "sup-1" },
      "https://app/auth/callback",
    );

    expect(tables.supplier_contacts.calls.insert).toEqual({ supplier_id: "sup-1", user_id: "u1" });
    expect(updateUserById).toHaveBeenCalledWith("u1", {
      app_metadata: { role: "supplier_contact", supplier_id: "sup-1" },
    });
  });

  it("maps an 'already registered' invite failure to already_exists", async () => {
    const { client } = fakeAdminClient({ inviteError: { message: "User already registered" } });

    await expect(
      inviteUser(client, { role: "admin", email: "dup@x.com" }, "https://app/auth/callback"),
    ).rejects.toMatchObject({ code: "already_exists" });
  });

  it("maps any other invite failure to invite_failed", async () => {
    const { client } = fakeAdminClient({ inviteError: { message: "SMTP not configured" } });

    await expect(
      inviteUser(client, { role: "admin", email: "a@x.com" }, "https://app/auth/callback"),
    ).rejects.toMatchObject({ code: "invite_failed", message: "SMTP not configured" });
  });

  it("rolls back (deletes the half-created user) when fixing up the role fails", async () => {
    const { client, deleteUser } = fakeAdminClient({ tableErrors: { profiles: { message: "constraint violation" } } });

    await expect(
      inviteUser(client, { role: "admin", email: "a@x.com" }, "https://app/auth/callback"),
    ).rejects.toMatchObject({ code: "invite_failed", message: "constraint violation" });
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });

  it("falls back to a generic message when the underlying error carries none", async () => {
    const { client } = fakeAdminClient({ tableErrors: { profiles: {} as unknown as { message: string } } });

    await expect(
      inviteUser(client, { role: "admin", email: "a@x.com" }, "https://app/auth/callback"),
    ).rejects.toMatchObject({ code: "invite_failed", message: "Could not finish setting up the invite." });
  });
});

describe("role-specific invite wrappers delegate to inviteUser with the right role", () => {
  it("inviteAdmin", async () => {
    const { client, updateUserById } = fakeAdminClient({});
    await inviteAdmin(client, { email: "a@x.com" }, "https://app/auth/callback");
    expect(updateUserById).toHaveBeenCalledWith("u1", { app_metadata: { role: "admin" } });
  });

  it("inviteAgent", async () => {
    const { client, updateUserById } = fakeAdminClient({});
    await inviteAgent(client, { email: "a@x.com" }, "https://app/auth/callback");
    expect(updateUserById).toHaveBeenCalledWith("u1", { app_metadata: { role: "agent" } });
  });

  it("inviteProductionStaff", async () => {
    const { client, updateUserById } = fakeAdminClient({});
    await inviteProductionStaff(client, "qc", { email: "a@x.com" }, "https://app/auth/callback");
    expect(updateUserById).toHaveBeenCalledWith("u1", { app_metadata: { role: "qc" } });
  });

  it("inviteSupplierContact", async () => {
    const { client, updateUserById } = fakeAdminClient({});
    await inviteSupplierContact(client, { email: "a@x.com", supplierId: "sup-1" }, "https://app/auth/callback");
    expect(updateUserById).toHaveBeenCalledWith("u1", {
      app_metadata: { role: "supplier_contact", supplier_id: "sup-1" },
    });
  });
});
