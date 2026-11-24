import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { approveForProduction } from "../../modules/production/approveForProduction";
import {
  getJobCorrectionEffect,
  requestMeasurementCorrection,
  respondMeasurementCorrection,
} from "../../modules/production/measurementCorrections";
import { estimateYardage } from "../../modules/rules/estimateYardage";
import { ORDER_PRICE_BOUNDS } from "../../modules/rules/priceOrder";
import { admin, cleanupAll, createOrderInProduction, createUserWithRole, signedInClient } from "./support";

// Migration 20261124200000 on real sessions (FR-AI-17): a small correction
// that changes the fabric needed can't be approved directly; it goes to the
// customer with the new price (which production staff can't read); not
// without the fabric in stock; accepting updates the order's yardage, price,
// fabric hold and cash to collect; then the tailor approves.

describe("correction that changes the fabric and price", () => {
  let tailor: SupabaseClient;
  let customer: SupabaseClient;
  let stranger: SupabaseClient;
  let tailorId: string;
  let customerId: string;
  let order: Awaited<ReturnType<typeof createOrderInProduction>>;

  // chest 90 confirmed; 0.04 m of fabric per cm of chest, 10% wastage.
  const formula = { base_metres: 4.5, coefficients: { chest: 0.04 }, wastage_margin: 0.1 };
  const yardageFor = (chest: number) =>
    estimateYardage({ yardageFormula: formula, measurements: { chest }, selection: {}, fabricHasDirectionalPattern: false });
  const confirmed = { chest: 90 };
  const corrected = { chest: 91.5 }; // 1.5 cm: under the 2 cm threshold, but +0.066 m of fabric
  const before = yardageFor(90); // 8.91
  const after = yardageFor(91.5); // 8.976
  const STITCH = 5000;
  const PRICE_PER_METRE = 1000;

  beforeAll(async () => {
    const t = await createUserWithRole("tailor", "cp-tailor");
    const c = await createUserWithRole("customer", "cp-cust");
    const s = await createUserWithRole("customer", "cp-stranger");
    tailorId = t.userId;
    customerId = c.userId;
    [tailor, customer, stranger] = await Promise.all([signedInClient(t), signedInClient(c), signedInClient(s)]);

    order = await createOrderInProduction("cp-order");
    const check = (r: { error: unknown }) => {
      if (r.error) throw r.error;
    };
    check(
      await admin
        .from("dress_templates")
        .update({ yardage_formula: formula, required_measurements: [{ key: "chest", label: "Chest", unit: "cm", min: 60, max: 160 }] })
        .eq("id", order.templateId),
    );
    const profile = await admin
      .from("measurement_profiles")
      .insert({ customer_id: customerId, measurement_values: confirmed, confirmed_by_id: customerId, confirmed_by_role: "customer", confirmed_at: new Date().toISOString() })
      .select("id")
      .single();
    check(profile);
    const total = before * PRICE_PER_METRE + STITCH;
    check(
      await admin
        .from("orders")
        .update({
          customer_id: customerId,
          measurement_profile_id: (profile.data as { id: string }).id,
          yardage_metres: before,
          fabric_cost: before * PRICE_PER_METRE,
          stitch_cost: STITCH,
          options_cost: 0,
          total,
          payment_method: "cash_on_delivery",
          payment_status: "unpaid",
        })
        .eq("id", order.orderId),
    );
    check(await admin.from("order_items").update({ measurements: confirmed, unit_price: total, options: [] }).eq("order_id", order.orderId));
    check(await admin.from("payments").delete().eq("order_id", order.orderId));
    check(await admin.from("payments").insert({ order_id: order.orderId, kind: "charge", method: "cash_on_delivery", amount: total, status: "pending" }));
    check(await admin.from("fabric_reservations").update({ metres: before, order_id: order.orderId }).eq("fabric_id", order.fabricId).eq("kind", "hard"));
    check(await admin.from("production_jobs").update({ assigned_to_id: tailorId }).eq("id", order.jobId));
  }, 90000);

  afterAll(async () => {
    await admin.from("notification_outbox").delete().eq("order_id", order.orderId);
    await admin.from("audit_log").delete().eq("entity_id", order.orderId);
    await admin.from("measurement_profiles").delete().eq("customer_id", customerId);
    await cleanupAll();
  }, 60000);

  it("keeps the database's price bounds equal to the app's", async () => {
    // fn_clamp_order_total is used through fn_correction_effect; check its bounds directly.
    const { data: low } = await admin.rpc("fn_clamp_order_total", { p_subtotal: 1 });
    const { data: high } = await admin.rpc("fn_clamp_order_total", { p_subtotal: 1_000_000 });
    expect([Number(low), Number(high)]).toEqual([ORDER_PRICE_BOUNDS.min, ORDER_PRICE_BOUNDS.max]);
  });

  it("the tailor sees the fabric change (metres matching the app's formula) and can't approve it directly", async () => {
    expect(await getJobCorrectionEffect(tailor, { jobId: order.jobId, values: { chest: 90.5 } })).toMatchObject({
      changesFabric: false,
      needsCustomer: false,
    });
    expect(await getJobCorrectionEffect(tailor, { jobId: order.jobId, values: corrected })).toEqual({
      changesFabric: true,
      yardageBefore: before,
      yardageAfter: after,
      needsCustomer: true,
    });
    await expect(getJobCorrectionEffect(stranger, { jobId: order.jobId, values: corrected })).rejects.toBeTruthy();
    await expect(approveForProduction(tailor, { jobId: order.jobId, values: corrected, reason: "Re-measured" })).rejects.toMatchObject({
      message: expect.stringContaining("change the fabric needed"),
    });
  });

  it("not without the extra fabric in stock", async () => {
    const { data: fabric } = await admin.from("fabrics").select("stock_metres").eq("id", order.fabricId).single();
    const stock = Number((fabric as { stock_metres: number }).stock_metres);
    const { data: held } = await admin.from("fabric_reservations").select("metres").eq("fabric_id", order.fabricId).eq("status", "active");
    const reserved = ((held ?? []) as { metres: number }[]).reduce((sum, r) => sum + Number(r.metres), 0);
    await admin.from("fabrics").update({ stock_metres: reserved + 0.03 }).eq("id", order.fabricId);
    await expect(
      requestMeasurementCorrection(tailor, { jobId: order.jobId, values: corrected, reason: "Re-measured" }),
    ).rejects.toMatchObject({ message: expect.stringContaining("Not enough fabric for this change") });
    await admin.from("fabrics").update({ stock_metres: stock }).eq("id", order.fabricId);
  });

  it("goes to the customer with the new price, which production staff can't read", async () => {
    const row = await requestMeasurementCorrection(tailor, { jobId: order.jobId, values: corrected, reason: "Re-measured at fitting" });
    expect([Number(row.yardage_before), Number(row.yardage_after)]).toEqual([before, after]);

    expect((await tailor.from("measurement_correction_prices").select("total_after").eq("order_id", order.orderId)).data).toEqual([]);
    expect((await stranger.from("measurement_correction_prices").select("total_after").eq("order_id", order.orderId)).data).toEqual([]);
    const seen = (await customer.from("measurement_correction_prices").select("total_before, total_after").eq("correction_id", row.id).single())
      .data as { total_before: number; total_after: number };
    expect([Number(seen.total_before), Number(seen.total_after)]).toEqual([before * PRICE_PER_METRE + STITCH, after * PRICE_PER_METRE + STITCH]);

    const { data: emails } = await admin.from("notification_outbox").select("template").eq("order_id", order.orderId);
    expect((emails ?? []).map((e) => (e as { template: string }).template)).toContain("measurement_correction_price");
  });

  it("accepting makes it the order's: yardage, price, item, fabric hold and cash to collect", async () => {
    const { data: pending } = await admin.from("measurement_corrections").select("id").eq("order_id", order.orderId).eq("status", "pending").single();
    await respondMeasurementCorrection(customer, { correctionId: (pending as { id: string }).id, accept: true });

    const newTotal = after * PRICE_PER_METRE + STITCH;
    const o = (await admin.from("orders").select("yardage_metres, fabric_cost, total").eq("id", order.orderId).single()).data as Record<string, number>;
    expect([Number(o.yardage_metres), Number(o.fabric_cost), Number(o.total)]).toEqual([after, after * PRICE_PER_METRE, newTotal]);
    const item = (await admin.from("order_items").select("unit_price").eq("order_id", order.orderId).single()).data as { unit_price: number };
    expect(Number(item.unit_price)).toBe(newTotal);
    const hold = (await admin.from("fabric_reservations").select("metres").eq("order_id", order.orderId).eq("kind", "hard").single()).data as {
      metres: number;
    };
    expect(Number(hold.metres)).toBe(after);
    const pay = (await admin.from("payments").select("amount").eq("order_id", order.orderId).eq("status", "pending").single()).data as {
      amount: number;
    };
    expect(Number(pay.amount)).toBe(newTotal);
    const { data: audit } = await admin.from("audit_log").select("action").eq("entity_id", order.orderId).eq("action", "order.price_changed");
    expect(audit).toHaveLength(1);
  });

  it("then the tailor approves exactly those values, and the original set now needs the customer", async () => {
    expect(await getJobCorrectionEffect(tailor, { jobId: order.jobId, values: confirmed })).toMatchObject({
      changesFabric: true,
      needsCustomer: true,
    });
    const approved = await approveForProduction(tailor, { jobId: order.jobId, values: corrected, reason: "Customer accepted" });
    expect(approved.status).toBe("measurements_approved");
  });
});
