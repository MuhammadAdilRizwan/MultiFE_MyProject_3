import { describe, expect, it } from "vitest";
import { createProvisionalCustomer, type CreateProvisionalCustomerParams } from "./createProvisionalCustomer";
import type { AnySupabaseClient } from "./types";

function fakeAdminClient(opts: {
  inviteResult?: { data?: unknown; error?: unknown };
  phoneUpdateResult?: { error?: unknown };
  profileUpdateResult?: { error?: unknown };
  insertResult?: { error?: unknown };
}) {
  const inviteResult = opts.inviteResult ?? { data: { user: { id: "cust-1" } }, error: null };
  const calls: {
    invite?: { email: string; options: unknown };
    phoneUpdate?: { id: string; attrs: unknown };
    profileUpdate?: { values: unknown; id: unknown };
    insert?: unknown;
    deletedUserId?: string;
  } = {};

  const builder: Record<string, unknown> = {
    insert: (v: unknown) => {
      calls.insert = v;
      return Promise.resolve(opts.insertResult ?? { error: null });
    },
    update: (values: unknown) => ({
      eq: (_column: string, id: unknown) => {
        calls.profileUpdate = { values, id };
        return Promise.resolve(opts.profileUpdateResult ?? { error: null });
      },
    }),
  };

  const client = {
    auth: {
      admin: {
        inviteUserByEmail: (email: string, options: unknown) => {
          calls.invite = { email, options };
          return Promise.resolve(inviteResult);
        },
        updateUserById: (id: string, attrs: unknown) => {
          calls.phoneUpdate = { id, attrs };
          return Promise.resolve(opts.phoneUpdateResult ?? { error: null });
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

const base: CreateProvisionalCustomerParams = {
  email: "sana@example.org",
  agentId: "agent-row-1",
  agentProfileId: "agent-profile-1",
  redirectTo: "http://localhost:3000/accept-invite",
};

describe("createProvisionalCustomer", () => {
  it("invites the customer by email, with their name, back to the accept-invite page", async () => {
    const { client, calls } = fakeAdminClient({});

    await createProvisionalCustomer(client, { ...base, fullName: "Sana Khan" });

    expect(calls.invite).toEqual({
      email: "sana@example.org",
      options: { data: { full_name: "Sana Khan" }, redirectTo: "http://localhost:3000/accept-invite" },
    });
    expect(calls.phoneUpdate).toBeUndefined();
  });

  it("adds the phone number when one is given", async () => {
    const { client, calls } = fakeAdminClient({});

    await createProvisionalCustomer(client, { ...base, phone: "+923001234567" });

    expect(calls.phoneUpdate).toEqual({ id: "cust-1", attrs: { phone: "+923001234567" } });
  });

  it("marks the new profile provisional and records the creating agent", async () => {
    const { client, calls } = fakeAdminClient({});

    await createProvisionalCustomer(client, base);

    expect(calls.profileUpdate).toEqual({
      values: { is_provisional: true, provisional_created_by_id: "agent-profile-1" },
      id: "cust-1",
    });
  });

  it("assigns the new customer to the creating agent and returns their id", async () => {
    const { client, calls } = fakeAdminClient({});

    await expect(createProvisionalCustomer(client, base)).resolves.toEqual({ customerId: "cust-1" });
    expect(calls.insert).toEqual({ agent_id: "agent-row-1", customer_id: "cust-1", source: "agent_created" });
  });

  it("accepts a custom source", async () => {
    const { client, calls } = fakeAdminClient({});

    await createProvisionalCustomer(client, { ...base, source: "walk-in" });

    expect(calls.insert).toMatchObject({ source: "walk-in" });
  });

  it("throws when the invite can't be sent, without creating anything", async () => {
    const { client, calls } = fakeAdminClient({ inviteResult: { error: { message: "already been registered" } } });

    await expect(createProvisionalCustomer(client, base)).rejects.toMatchObject({ message: "already been registered" });
    expect(calls.deletedUserId).toBeUndefined();
    expect(calls.insert).toBeUndefined();
  });

  it.each([
    ["the phone number is taken", { phoneUpdateResult: { error: { message: "phone exists" } } }, "phone exists"],
    ["the profile can't be marked provisional", { profileUpdateResult: { error: { message: "update failed" } } }, "update failed"],
    ["the agent assignment fails", { insertResult: { error: { message: "fk violation" } } }, "fk violation"],
  ])("rolls back the new user when %s", async (_case, opts, message) => {
    const { client, calls } = fakeAdminClient(opts);

    await expect(createProvisionalCustomer(client, { ...base, phone: "+923001234567" })).rejects.toMatchObject({ message });
    expect(calls.deletedUserId).toBe("cust-1");
  });
});
