// Security review items: fabric-reservation functions must only act on the
// caller's own draft, and order_drafts writes must be scoped to the customer
// themselves or an agent assigned to that customer.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  assignCustomerToAgent,
  cleanupAll,
  createAgent,
  createSupplier,
  createUserWithRole,
  signedInClient,
  uniqueSlug,
} from "./support";

describe("fabric reservations and order_drafts: caller scoping", () => {
  let customerA: Awaited<ReturnType<typeof createUserWithRole>>;
  let customerB: Awaited<ReturnType<typeof createUserWithRole>>;
  let assignedAgent: Awaited<ReturnType<typeof createAgent>>;
  let otherAgent: Awaited<ReturnType<typeof createAgent>>;
  let fabricId: string;
  let templateId: string;
  let draftAId: string;
  const draftIds: string[] = [];

  beforeAll(async () => {
    customerA = await createUserWithRole("customer", "resv-a");
    customerB = await createUserWithRole("customer", "resv-b");
    assignedAgent = await createAgent("resv-agent1");
    otherAgent = await createAgent("resv-agent2");
    await assignCustomerToAgent(assignedAgent.agentId, customerA.userId);

    const supplierId = await createSupplier("resv-supplier", "active");
    const { data: fabric, error: fabricError } = await admin
      .from("fabrics")
      .insert({ supplier_id: supplierId, external_id: uniqueSlug("ext"), name: "resv", price_per_metre: 1000, stock_metres: 100, is_available: true })
      .select("id")
      .single();
    if (fabricError) throw fabricError;
    fabricId = fabric.id as string;

    const { data: template, error: templateError } = await admin
      .from("dress_templates")
      .insert({ name: "resv", slug: uniqueSlug("resv"), base_stitch_price: 500, required_measurements: [] })
      .select("id")
      .single();
    if (templateError) throw templateError;
    templateId = template.id as string;

    const { data: draft, error: draftError } = await admin
      .from("order_drafts")
      .insert({ customer_id: customerA.userId, fabric_id: fabricId, template_id: templateId, options: {} })
      .select("id")
      .single();
    if (draftError) throw draftError;
    draftAId = draft.id as string;
    draftIds.push(draftAId);
  }, 60000);

  afterAll(async () => {
    await admin.from("fabric_reservations").delete().eq("fabric_id", fabricId);
    for (const id of draftIds) await admin.from("order_drafts").delete().eq("id", id);
    await admin.from("fabrics").delete().eq("id", fabricId);
    await admin.from("dress_templates").delete().eq("id", templateId);
    await cleanupAll();
  });

  // ---- fabric reservations -------------------------------------------------

  it("a signed-in user cannot call fn_take_hard_reservation directly", async () => {
    const client = await signedInClient(customerA);
    const { error } = await client.rpc("fn_take_hard_reservation", {
      p_draft_id: draftAId,
      p_fabric_id: fabricId,
      p_metres: 90,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("a customer cannot soft-reserve against another customer's draft", async () => {
    const client = await signedInClient(customerB);
    const { error } = await client.rpc("fn_take_soft_reservation", {
      p_draft_id: draftAId,
      p_fabric_id: fabricId,
      p_metres: 5,
    });
    expect(error?.code).toBe("42501");
  });

  it("an agent not assigned to the draft cannot soft-reserve against it", async () => {
    const client = await signedInClient(otherAgent);
    const { error } = await client.rpc("fn_take_soft_reservation", {
      p_draft_id: draftAId,
      p_fabric_id: fabricId,
      p_metres: 5,
    });
    expect(error?.code).toBe("42501");
  });

  it("the draft's owner can still take a soft reservation", async () => {
    const client = await signedInClient(customerA);
    const { data, error } = await client.rpc("fn_take_soft_reservation", {
      p_draft_id: draftAId,
      p_fabric_id: fabricId,
      p_metres: 5,
    });
    expect(error).toBeNull();
    expect((data as { kind: string }).kind).toBe("soft");
  });

  it("a caller-supplied expiry cannot make a soft hold last longer than 20 minutes", async () => {
    const client = await signedInClient(customerA);
    const { data, error } = await client.rpc("fn_take_soft_reservation", {
      p_draft_id: draftAId,
      p_fabric_id: fabricId,
      p_metres: 5,
      p_expires_in: "100 years",
    });
    expect(error).toBeNull();
    const expiresAt = new Date((data as { expires_at: string }).expires_at).getTime();
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(21 * 60 * 1000);
  });

  it("an absurd quantity is rejected", async () => {
    const client = await signedInClient(customerA);
    const { error } = await client.rpc("fn_take_soft_reservation", {
      p_draft_id: draftAId,
      p_fabric_id: fabricId,
      p_metres: 40,
    });
    expect(error?.code).toBe("22023");
    expect(error?.message).toBe("Invalid quantity");
  });

  it("the reservation-expiry cron job marks a lapsed soft hold 'expired' on its own", async () => {
    const { data: draft, error: draftError } = await admin
      .from("order_drafts")
      .insert({ customer_id: customerB.userId, fabric_id: fabricId, template_id: templateId, options: {} })
      .select("id")
      .single();
    if (draftError) throw draftError;
    draftIds.push(draft.id as string);

    // A soft hold whose 20 minutes are already up, but still 'active'.
    const { data: hold, error: holdError } = await admin
      .from("fabric_reservations")
      .insert({
        fabric_id: fabricId,
        order_draft_id: draft.id,
        metres: 3,
        kind: "soft",
        status: "active",
        expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (holdError) throw holdError;

    // The job runs every minute; nothing in this test calls the sweep itself.
    const deadline = Date.now() + 75 * 1000;
    let status = "active";
    while (Date.now() < deadline) {
      const { data } = await admin.from("fabric_reservations").select("status").eq("id", hold.id).single();
      status = (data as { status: string }).status;
      if (status === "expired") break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    expect(status).toBe("expired");
  }, 90000);

  // ---- order_drafts --------------------------------------------------------

  it("a customer can create their own draft", async () => {
    const client = await signedInClient(customerB);
    const { data, error } = await client
      .from("order_drafts")
      .insert({ customer_id: customerB.userId, fabric_id: fabricId, template_id: templateId, options: {} })
      .select("id")
      .single();
    expect(error).toBeNull();
    draftIds.push(data!.id as string);
  });

  it("a customer cannot create a draft naming an agent", async () => {
    const client = await signedInClient(customerB);
    const { error } = await client
      .from("order_drafts")
      .insert({ customer_id: customerB.userId, agent_id: otherAgent.userId, fabric_id: fabricId, template_id: templateId, options: {} });
    expect(error).not.toBeNull();
  });

  it("an agent can create a draft for an assigned customer", async () => {
    const client = await signedInClient(assignedAgent);
    const { data, error } = await client
      .from("order_drafts")
      .insert({ customer_id: customerA.userId, agent_id: assignedAgent.userId, fabric_id: fabricId, template_id: templateId, options: {} })
      .select("id")
      .single();
    expect(error).toBeNull();
    draftIds.push(data!.id as string);
  });

  it("an agent cannot create a draft for a customer who isn't assigned to them", async () => {
    const client = await signedInClient(otherAgent);
    const { error } = await client
      .from("order_drafts")
      .insert({ customer_id: customerB.userId, agent_id: otherAgent.userId, fabric_id: fabricId, template_id: templateId, options: {} });
    expect(error).not.toBeNull();
  });
});
