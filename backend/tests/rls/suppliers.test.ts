import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  cleanupAll,
  createSupplier,
  createSupplierContact,
  createUserWithRole,
  signedInClient,
} from "./support";

describe("suppliers RLS isolation", () => {
  let activeSupplierId: string;
  let pendingSupplierId: string;
  let pendingContact: Awaited<ReturnType<typeof createSupplierContact>>;
  let unrelatedCustomer: Awaited<ReturnType<typeof createUserWithRole>>;

  beforeAll(async () => {
    activeSupplierId = await createSupplier("Khadi-like Active", "active");
    pendingSupplierId = await createSupplier("Not Yet Live", "pending");
    pendingContact = await createSupplierContact("pendingContact", pendingSupplierId);
    unrelatedCustomer = await createUserWithRole("customer", "unrelated");
  }, 30000);

  afterAll(async () => {
    await cleanupAll();
  });

  it("anyone (even signed out) can read an active supplier", async () => {
    const { data } = await anonClient().from("suppliers").select("id").eq("id", activeSupplierId).maybeSingle();
    expect(data?.id).toBe(activeSupplierId);
  });

  it("a signed-out caller cannot read a pending (not-yet-live) supplier", async () => {
    const { data } = await anonClient().from("suppliers").select("id").eq("id", pendingSupplierId).maybeSingle();
    expect(data).toBeNull();
  });

  it("an unrelated authenticated customer cannot read a pending supplier either", async () => {
    const client = await signedInClient(unrelatedCustomer);
    const { data } = await client.from("suppliers").select("id").eq("id", pendingSupplierId).maybeSingle();
    expect(data).toBeNull();
  });

  it("a supplier's own contact can read it even while pending (not yet active)", async () => {
    const client = await signedInClient(pendingContact);
    const { data } = await client.from("suppliers").select("id").eq("id", pendingSupplierId).maybeSingle();
    expect(data?.id).toBe(pendingSupplierId);
  });
});
