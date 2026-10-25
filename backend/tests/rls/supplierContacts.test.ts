import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  cleanupAll,
  createSupplier,
  createSupplierContact,
  createUserWithRole,
  signedInClient,
} from "./support";

describe("supplier_contacts RLS isolation", () => {
  let contact1: Awaited<ReturnType<typeof createSupplierContact>>;
  let contact2: Awaited<ReturnType<typeof createSupplierContact>>;
  let adminUser: Awaited<ReturnType<typeof createUserWithRole>>;

  beforeAll(async () => {
    const supplierA = await createSupplier("Supplier A", "pending");
    const supplierB = await createSupplier("Supplier B", "pending");
    contact1 = await createSupplierContact("supc1", supplierA);
    contact2 = await createSupplierContact("supc2", supplierB);
    adminUser = await createUserWithRole("admin", "admin1");
  }, 30000);

  afterAll(async () => {
    await cleanupAll();
  });

  it("a supplier contact reads their own linking row", async () => {
    const client = await signedInClient(contact1);
    const { data } = await client.from("supplier_contacts").select("user_id").eq("user_id", contact1.userId).maybeSingle();
    expect(data?.user_id).toBe(contact1.userId);
  });

  it("a supplier contact cannot read another supplier's contact row", async () => {
    const { data: viaAdmin } = await admin
      .from("supplier_contacts")
      .select("user_id")
      .eq("user_id", contact2.userId)
      .maybeSingle();
    expect(viaAdmin).not.toBeNull();

    const client = await signedInClient(contact1);
    const { data } = await client.from("supplier_contacts").select("user_id").eq("user_id", contact2.userId).maybeSingle();
    expect(data).toBeNull();
  });

  it("an admin reads any supplier contact's row", async () => {
    const client = await signedInClient(adminUser);
    const { data } = await client.from("supplier_contacts").select("user_id").eq("user_id", contact2.userId).maybeSingle();
    expect(data?.user_id).toBe(contact2.userId);
  });
});
