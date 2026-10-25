import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupAll, createAgent, createUserWithRole, signedInClient } from "./support";

describe("agents RLS isolation", () => {
  let agent1: Awaited<ReturnType<typeof createAgent>>;
  let agent2: Awaited<ReturnType<typeof createAgent>>;
  let adminUser: Awaited<ReturnType<typeof createUserWithRole>>;

  beforeAll(async () => {
    agent1 = await createAgent("agent1");
    agent2 = await createAgent("agent2");
    adminUser = await createUserWithRole("admin", "admin1");
  }, 30000);

  afterAll(async () => {
    await cleanupAll();
  });

  it("an agent reads their own agents row", async () => {
    const client = await signedInClient(agent1);
    const { data } = await client.from("agents").select("id").eq("id", agent1.agentId).maybeSingle();
    expect(data?.id).toBe(agent1.agentId);
  });

  it("an agent cannot read another agent's row", async () => {
    const { data: viaAdmin } = await admin.from("agents").select("id").eq("id", agent2.agentId).maybeSingle();
    expect(viaAdmin).not.toBeNull();

    const client = await signedInClient(agent1);
    const { data } = await client.from("agents").select("id").eq("id", agent2.agentId).maybeSingle();
    expect(data).toBeNull();
  });

  it("an admin reads any agent's row", async () => {
    const client = await signedInClient(adminUser);
    const { data } = await client.from("agents").select("id").eq("id", agent2.agentId).maybeSingle();
    expect(data?.id).toBe(agent2.agentId);
  });
});
