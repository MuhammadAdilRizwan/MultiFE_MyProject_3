import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anonClient,
  assignCustomerToAgent,
  cleanupAll,
  createAgent,
  createSupplierContact,
  createSupplier,
  createUserWithRole,
  signedInClient,
} from "./support";

// WBS 1.4: profiles RLS, one case per role. Each negative case first confirms
// (via the service-role client) that the row genuinely exists, then asserts
// the restricted client can't see it — so a pass proves isolation, not just
// an empty table.
describe("profiles RLS isolation", () => {
  let customerA: Awaited<ReturnType<typeof createUserWithRole>>;
  let customerB: Awaited<ReturnType<typeof createUserWithRole>>;
  let agent: Awaited<ReturnType<typeof createAgent>>;
  let tailor: Awaited<ReturnType<typeof createUserWithRole>>;
  let supplierContact: Awaited<ReturnType<typeof createUserWithRole>>;
  let adminUser: Awaited<ReturnType<typeof createUserWithRole>>;

  beforeAll(async () => {
    customerA = await createUserWithRole("customer", "custA");
    customerB = await createUserWithRole("customer", "custB");
    agent = await createAgent("agent1");
    await assignCustomerToAgent(agent.agentId, customerA.userId);
    tailor = await createUserWithRole("tailor", "tailor1");
    const supplierId = await createSupplier("Isolation Test Supplier", "pending");
    supplierContact = await createSupplierContact("supc1", supplierId);
    adminUser = await createUserWithRole("admin", "admin1");
  }, 30000);

  afterAll(async () => {
    await cleanupAll();
  });

  it("a customer reads their own profile", async () => {
    const client = await signedInClient(customerA);
    const { data } = await client.from("profiles").select("id, role").eq("id", customerA.userId).maybeSingle();
    expect(data?.role).toBe("customer");
  });

  it("a customer cannot read another customer's profile", async () => {
    const { data: viaAdmin } = await admin.from("profiles").select("id").eq("id", customerB.userId).maybeSingle();
    expect(viaAdmin).not.toBeNull(); // the row genuinely exists

    const client = await signedInClient(customerA);
    const { data } = await client.from("profiles").select("id").eq("id", customerB.userId).maybeSingle();
    expect(data).toBeNull();
  });

  it("an anonymous (signed-out) caller cannot read any profile", async () => {
    const { data } = await anonClient().from("profiles").select("id").eq("id", customerA.userId).maybeSingle();
    expect(data).toBeNull();
  });

  it("an agent reads their assigned customer's profile", async () => {
    const client = await signedInClient(agent);
    const { data } = await client.from("profiles").select("id").eq("id", customerA.userId).maybeSingle();
    expect(data?.id).toBe(customerA.userId);
  });

  it("NFR-SEC-02: an agent cannot read a customer outside their agent_customers assignment", async () => {
    const client = await signedInClient(agent);
    const { data } = await client.from("profiles").select("id").eq("id", customerB.userId).maybeSingle();
    expect(data).toBeNull();
  });

  it("a tailor with no assigned job cannot read a customer's profile", async () => {
    const client = await signedInClient(tailor);
    const { data } = await client.from("profiles").select("id").eq("id", customerA.userId).maybeSingle();
    expect(data).toBeNull();
  });

  it("FR-AUTH-07 / NFR-SEC-03: a supplier contact cannot read a customer's profile", async () => {
    const client = await signedInClient(supplierContact);
    const { data } = await client.from("profiles").select("id").eq("id", customerA.userId).maybeSingle();
    expect(data).toBeNull();
  });

  it("an admin reads any profile", async () => {
    const client = await signedInClient(adminUser);
    const { data } = await client.from("profiles").select("id").eq("id", customerB.userId).maybeSingle();
    expect(data?.id).toBe(customerB.userId);
  });

  it("a non-admin cannot escalate their own role through an update", async () => {
    const client = await signedInClient(customerA);
    const { error } = await client.from("profiles").update({ role: "admin" }).eq("id", customerA.userId);
    expect(error).not.toBeNull();

    const { data: afterAttempt } = await admin.from("profiles").select("role").eq("id", customerA.userId).single();
    expect(afterAttempt.role).toBe("customer");
  });
});
