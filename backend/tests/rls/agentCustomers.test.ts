import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assignCustomerToAgent,
  cleanupAll,
  createAgent,
  createUserWithRole,
  signedInClient,
} from "./support";

describe("agent_customers RLS isolation", () => {
  let agent1: Awaited<ReturnType<typeof createAgent>>;
  let agent2: Awaited<ReturnType<typeof createAgent>>;
  let customer1: Awaited<ReturnType<typeof createUserWithRole>>;
  let adminUser: Awaited<ReturnType<typeof createUserWithRole>>;

  beforeAll(async () => {
    agent1 = await createAgent("agent1");
    agent2 = await createAgent("agent2");
    customer1 = await createUserWithRole("customer", "cust1");
    adminUser = await createUserWithRole("admin", "admin1");
    await assignCustomerToAgent(agent1.agentId, customer1.userId);
  }, 30000);

  afterAll(async () => {
    await cleanupAll();
  });

  it("an agent reads their own agent_customers row", async () => {
    const client = await signedInClient(agent1);
    const { data } = await client
      .from("agent_customers")
      .select("id, customer_id")
      .eq("customer_id", customer1.userId)
      .maybeSingle();
    expect(data?.customer_id).toBe(customer1.userId);
  });

  it("an agent cannot read another agent's agent_customers row", async () => {
    const client = await signedInClient(agent2);
    const { data } = await client
      .from("agent_customers")
      .select("id, customer_id")
      .eq("customer_id", customer1.userId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("an admin reads any agent_customers row", async () => {
    const client = await signedInClient(adminUser);
    const { data } = await client
      .from("agent_customers")
      .select("id, customer_id")
      .eq("customer_id", customer1.userId)
      .maybeSingle();
    expect(data?.customer_id).toBe(customer1.userId);
  });
});
