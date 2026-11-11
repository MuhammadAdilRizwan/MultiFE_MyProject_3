import { describe, expect, it } from "vitest";
import { createProvisionalCustomer } from "./createProvisionalCustomer";
import type { AnySupabaseClient } from "./types";

function fakeAdminClient(opts: {
  createUserResult?: { data?: unknown; error?: unknown };
  insertResult?: { data?: unknown; error?: unknown };
}) {
  const createUserResult = opts.createUserResult ?? { data: { user: { id: "cust-1" } }, error: null };
  const insertResult = opts.insertResult ?? { error: null };

  const calls: { createUser?: unknown; insert?: unknown; deletedUserId?: string } = {};

  const builder: Record<string, unknown> = {
    insert: (v: unknown) => {
      calls.insert = v;
      return Promise.resolve(insertResult);
    },
  };

  const client = {
    auth: {
      admin: {
        createUser: (params: unknown) => {
          calls.createUser = params;
          return Promise.resolve(createUserResult);
        },
        deleteUser: (userId: string) => {
          calls.deletedUserId = userId;
          return Promise.resolve({ error: null });
        },
      },
    },
    from: () => builder,
  };

  return { client: client as unknown as AnySupabaseClient, calls };
}

describe("createProvisionalCustomer", () => {
  it("creates an unconfirmed phone-only auth user flagged provisional", async () => {
    const { client, calls } = fakeAdminClient({});

    await createProvisionalCustomer(client, {
      phone: "+923001234567",
      fullName: "Sana Khan",
      agentId: "agent-row-1",
      agentProfileId: "agent-profile-1",
    });

    expect(calls.createUser).toEqual({
      phone: "+923001234567",
      phone_confirm: false,
      user_metadata: { full_name: "Sana Khan" },
      app_metadata: { role: "customer", provisional: true, provisional_created_by_id: "agent-profile-1" },
    });
  });

  it("assigns the new customer to the creating agent", async () => {
    const { client, calls } = fakeAdminClient({});

    await createProvisionalCustomer(client, {
      phone: "+923001234567",
      agentId: "agent-row-1",
      agentProfileId: "agent-profile-1",
    });

    expect(calls.insert).toEqual({ agent_id: "agent-row-1", customer_id: "cust-1", source: "agent_created" });
  });

  it("accepts a custom source", async () => {
    const { client, calls } = fakeAdminClient({});

    await createProvisionalCustomer(client, {
      phone: "+923001234567",
      agentId: "agent-row-1",
      agentProfileId: "agent-profile-1",
      source: "walk-in",
    });

    expect(calls.insert).toMatchObject({ source: "walk-in" });
  });

  it("returns the new customer's id", async () => {
    const { client } = fakeAdminClient({});

    const result = await createProvisionalCustomer(client, {
      phone: "+923001234567",
      agentId: "agent-row-1",
      agentProfileId: "agent-profile-1",
    });

    expect(result).toEqual({ customerId: "cust-1" });
  });

  it("throws when the auth user can't be created", async () => {
    const { client, calls } = fakeAdminClient({ createUserResult: { error: { message: "phone already in use" } } });

    await expect(
      createProvisionalCustomer(client, { phone: "+923001234567", agentId: "a1", agentProfileId: "p1" }),
    ).rejects.toMatchObject({ message: "phone already in use" });
    expect(calls.deletedUserId).toBeUndefined();
  });

  it("rolls back the auth user when the agent_customers assignment fails", async () => {
    const { client, calls } = fakeAdminClient({ insertResult: { error: { message: "fk violation" } } });

    await expect(
      createProvisionalCustomer(client, { phone: "+923001234567", agentId: "a1", agentProfileId: "p1" }),
    ).rejects.toMatchObject({ message: "fk violation" });
    expect(calls.deletedUserId).toBe("cust-1");
  });
});
