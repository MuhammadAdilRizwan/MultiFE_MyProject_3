// NFR-SEC-03 / FR-AUTH-07: a supplier contact sees their own store's fabric
// and supply data only — never customer identity, measurements or what
// MultiFe charged — and can change nothing. Real sessions against the
// configured project; fixtures are deleted afterwards.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  cleanupAll,
  createOrderInProduction,
  createSupplier,
  createSupplierContact,
  signedInClient,
  uniqueSlug,
} from "./support";

type Client = Awaited<ReturnType<typeof signedInClient>>;

describe("supplier contact isolation (NFR-SEC-03)", () => {
  let storeA: string;
  let storeB: string;
  let order: Awaited<ReturnType<typeof createOrderInProduction>>;
  let hiddenA: string;
  let hiddenB: string;
  let contactA: Client;

  beforeAll(async () => {
    // Store A has a real order (customer, measurements, payment, job) on its fabric.
    order = await createOrderInProduction("iso-store-a");
    const { data: fabric } = await admin.from("fabrics").select("supplier_id").eq("id", order.fabricId).single();
    storeA = (fabric as { supplier_id: string }).supplier_id;
    storeB = await createSupplier("Iso Store B", "active");

    const hidden = await admin
      .from("fabrics")
      .insert([
        { supplier_id: storeA, external_id: uniqueSlug("hid-a"), name: "Hidden A", price_per_metre: 900, stock_metres: 10, is_hidden: true },
        { supplier_id: storeB, external_id: uniqueSlug("hid-b"), name: "Hidden B", price_per_metre: 900, stock_metres: 10, is_hidden: true },
      ])
      .select("id, supplier_id");
    if (hidden.error) throw hidden.error;
    hiddenA = hidden.data.find((f) => f.supplier_id === storeA)!.id;
    hiddenB = hidden.data.find((f) => f.supplier_id === storeB)!.id;

    for (const supplierId of [storeA, storeB]) {
      const i = await admin.from("supplier_integrations").insert({
        supplier_id: supplierId,
        provider_kind: "api",
        credentials_ref: `vault:test-${supplierId}`,
        capabilities: { catalogue_read: true },
      });
      if (i.error) throw i.error;
      const r = await admin.from("integration_sync_runs").insert({ supplier_id: supplierId, created_count: 1 });
      if (r.error) throw r.error;
      const o = await admin.from("integration_outbox").insert({ supplier_id: supplierId, idempotency_key: uniqueSlug("idem") });
      if (o.error) throw o.error;
    }

    contactA = await signedInClient(await createSupplierContact("isoContactA", storeA));
  }, 60000);

  afterAll(async () => {
    // The order queued an email and wrote history; don't leave them behind.
    if (order) {
      await admin.from("notification_outbox").delete().eq("order_id", order.orderId);
      await admin.from("audit_log").delete().in("entity_id", [order.orderId, order.jobId]);
    }
    await cleanupAll();
  });

  it("reads their own store's fabrics, hidden ones included", async () => {
    const { data } = await contactA.from("fabrics").select("id").in("id", [order.fabricId, hiddenA]);
    expect(data?.map((r) => r.id).sort()).toEqual([order.fabricId, hiddenA].sort());
  });

  it("cannot read another store's hidden fabric", async () => {
    const { data } = await contactA.from("fabrics").select("id").eq("id", hiddenB);
    expect(data).toEqual([]);
  });

  it("cannot read orders, even ones on their own fabric", async () => {
    for (const table of ["orders", "order_items", "order_status_history", "payments", "shipments", "production_jobs"]) {
      const column = table === "orders" ? "id" : "order_id";
      const { data } = await contactA.from(table).select(column).eq(column, order.orderId);
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("cannot read the customer's profile or measurements", async () => {
    const profile = await contactA.from("profiles").select("id").eq("id", order.customerId);
    expect(profile.data).toEqual([]);
    const measurements = await contactA.from("measurement_profiles").select("id").eq("customer_id", order.customerId);
    expect(measurements.data).toEqual([]);
  });

  it("cannot read reservations directly, only the per-fabric totals view", async () => {
    const direct = await contactA.from("fabric_reservations").select("id").eq("fabric_id", order.fabricId);
    expect(direct.data ?? []).toEqual([]);

    const summary = await contactA.from("supplier_fabric_reservation_summary").select("*");
    expect(summary.error).toBeNull();
    expect(summary.data!.length).toBeGreaterThan(0);
    for (const row of summary.data!) {
      expect(row.supplier_id).toBe(storeA);
      expect(Object.keys(row).sort()).toEqual(["fabric_id", "kind", "metres", "reservation_count", "status", "supplier_id"]);
    }
  });

  it("cannot read integration settings or credentials; the status view shows only their own store", async () => {
    const table = await contactA.from("supplier_integrations").select("id");
    expect(table.data ?? []).toEqual([]);

    const view = await contactA.from("supplier_integration_status_view").select("*");
    expect(view.data?.map((r) => r.supplier_id)).toEqual([storeA]);
    expect(Object.keys(view.data![0])).not.toContain("credentials_ref");
    expect(JSON.stringify(view.data)).not.toContain("vault:");
  });

  it("reads their own sync runs and outbox rows, not another store's", async () => {
    for (const table of ["integration_sync_runs", "integration_outbox"]) {
      const { data } = await contactA.from(table).select("supplier_id").in("supplier_id", [storeA, storeB]);
      expect(data?.map((r) => r.supplier_id), table).toEqual([storeA]);
    }
  });

  it("can change nothing: fabrics, store, settings, contacts", async () => {
    await contactA.from("fabrics").update({ price_per_metre: 1, stock_metres: 9999 }).eq("id", hiddenA);
    const fabric = await admin.from("fabrics").select("price_per_metre, stock_metres").eq("id", hiddenA).single();
    expect(Number(fabric.data!.price_per_metre)).toBe(900);
    expect(Number(fabric.data!.stock_metres)).toBe(10);

    const insertFabric = await contactA
      .from("fabrics")
      .insert({ supplier_id: storeA, external_id: uniqueSlug("x"), name: "Sneaky", price_per_metre: 1 });
    expect(insertFabric.error).not.toBeNull();

    await contactA.from("suppliers").update({ status: "suspended", name: "Renamed" }).eq("id", storeA);
    const store = await admin.from("suppliers").select("status, name").eq("id", storeA).single();
    expect(store.data).toEqual({ status: "active", name: "iso-store-a" });

    const insertIntegration = await contactA
      .from("supplier_integrations")
      .upsert({ supplier_id: storeA, provider_kind: "manual" }, { onConflict: "supplier_id" });
    expect(insertIntegration.error).not.toBeNull();
    const integration = await admin.from("supplier_integrations").select("provider_kind").eq("supplier_id", storeA).single();
    expect(integration.data!.provider_kind).toBe("api");

    const addContact = await contactA.from("supplier_contacts").insert({ supplier_id: storeB, user_id: order.customerId });
    expect(addContact.error).not.toBeNull();
  });
});
