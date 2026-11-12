import { beforeEach, describe, expect, it, vi } from "vitest";

// Thin Server Actions over already-tested backend modules (agents, users) —
// these tests isolate the actions' own logic (Zod validation, actor checks,
// and the admin-client composition) by mocking every collaborator at the
// boundary, same convention as (order)/order-actions.test.ts.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/agents/getCurrentAgent", () => ({ getCurrentAgent: vi.fn() }));
vi.mock("@multife/backend/modules/agents/createProvisionalCustomer", () => ({ createProvisionalCustomer: vi.fn() }));
vi.mock("@multife/backend/modules/agents/listMyCustomers", () => ({ listMyCustomers: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { getCurrentAgent } from "@multife/backend/modules/agents/getCurrentAgent";
import { createProvisionalCustomer } from "@multife/backend/modules/agents/createProvisionalCustomer";
import { listMyCustomers } from "@multife/backend/modules/agents/listMyCustomers";
import { createProvisionalCustomerAction, listMyCustomersAction } from "./agent-actions";

const fakeSupabase = {};
const fakeAdminClient = {};

beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue(fakeSupabase as never);
  vi.mocked(createAdminClient).mockReturnValue(fakeAdminClient as never);
});

describe("createProvisionalCustomerAction", () => {
  it("rejects a missing or invalid email", async () => {
    expect((await createProvisionalCustomerAction({} as never)).ok).toBe(false);
    expect(await createProvisionalCustomerAction({ email: "not-an-email" })).toEqual({
      ok: false,
      error: "Enter the customer's email address.",
    });
    expect(createProvisionalCustomer).not.toHaveBeenCalled();
  });

  it("fails when nobody is signed in", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);

    const result = await createProvisionalCustomerAction({ email: "sana@example.org" });

    expect(result).toEqual({ ok: false, error: "Sign in as an agent to add a customer." });
    expect(getCurrentAgent).not.toHaveBeenCalled();
  });

  it("fails when the signed-in profile isn't an active agent", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "customer", status: "active" } as never);

    const result = await createProvisionalCustomerAction({ email: "sana@example.org" });

    expect(result).toEqual({ ok: false, error: "Sign in as an agent to add a customer." });
  });

  it("fails when the agent has no agents row or it's suspended", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "agent", status: "active" } as never);
    vi.mocked(getCurrentAgent).mockResolvedValue(null);

    const result = await createProvisionalCustomerAction({ email: "sana@example.org" });

    expect(result).toEqual({ ok: false, error: "Your agent account isn't active." });
  });

  it("creates the provisional customer and assigns them to the calling agent", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "agent", status: "active" } as never);
    vi.mocked(getCurrentAgent).mockResolvedValue({
      id: "a1",
      profile_id: "p1",
      code: "AG-1",
      region: null,
      status: "active",
    } as never);
    vi.mocked(createProvisionalCustomer).mockResolvedValue({ customerId: "c1" });

    const result = await createProvisionalCustomerAction({
      email: " Sana@Example.org ",
      phone: "+923001234567",
      fullName: "Sana Khan",
    });

    expect(createProvisionalCustomer).toHaveBeenCalledWith(fakeAdminClient, {
      email: "sana@example.org",
      phone: "+923001234567",
      fullName: "Sana Khan",
      agentId: "a1",
      agentProfileId: "p1",
      redirectTo: "http://localhost:3000/accept-invite",
    });
    expect(result).toEqual({ ok: true, data: { customerId: "c1" } });
  });
});

describe("listMyCustomersAction", () => {
  it("fails when nobody is signed in", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);

    const result = await listMyCustomersAction();

    expect(result).toEqual({ ok: false, error: "Sign in as an agent to view your customers." });
    expect(listMyCustomers).not.toHaveBeenCalled();
  });

  it("fails when the signed-in profile isn't an agent", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "customer", status: "active" } as never);

    const result = await listMyCustomersAction();

    expect(result).toEqual({ ok: false, error: "Sign in as an agent to view your customers." });
  });

  it("fails when the agent has no agents row", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "agent", status: "active" } as never);
    vi.mocked(getCurrentAgent).mockResolvedValue(null);

    const result = await listMyCustomersAction();

    expect(result).toEqual({ ok: false, error: "Your agent account isn't set up correctly." });
  });

  it("returns the agent's assigned customers", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "p1", role: "agent", status: "active" } as never);
    vi.mocked(getCurrentAgent).mockResolvedValue({
      id: "a1",
      profile_id: "p1",
      code: "AG-1",
      region: null,
      status: "active",
    } as never);
    vi.mocked(listMyCustomers).mockResolvedValue([{ id: "ac1", customer_id: "c1" } as never]);

    const result = await listMyCustomersAction();

    expect(listMyCustomers).toHaveBeenCalledWith(fakeSupabase, "a1");
    expect(result).toEqual({ ok: true, data: [{ id: "ac1", customer_id: "c1" }] });
  });
});
