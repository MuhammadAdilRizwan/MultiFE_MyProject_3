import type { ResolvedOption } from "../rules/orderSummary";
import type { PriceBreakdown } from "../rules/priceOrder";
import type { AnySupabaseClient } from "./types";

export interface DeliveryAddress {
  full_name: string;
  phone: string;
  address_line: string;
  city: string;
}

export interface PlaceCodOrderParams {
  draftId: string;
  customerId: string;
  // Server-computed from the confirmed measurements (priceOrder) — never
  // from the browser.
  pricing: PriceBreakdown;
  leadDays: number;
  options: ResolvedOption[];
  delivery: DeliveryAddress;
  idempotencyKey: string;
  // The agent's profile id for an agent-placed order (FR-AGT-03); omitted
  // for a customer's own order.
  placedBy?: string;
}

export interface PlacedOrder {
  id: string;
  number: string;
  total: number;
  est_delivery_date: string | null;
}

// Thin RPC wrapper over fn_place_cod_order (cash on delivery, agreed until a
// payment gateway is chosen) — the customer's own order or one an agent
// places for them (placedBy). Service-role only: pass the admin client, and
// only after the caller has checked the customer owns the draft and priced
// it on the server. The DB function holds the hard reservation, idempotency
// and the order snapshot; its errors ("Not enough fabric in stock…",
// "Measurements are not confirmed") come back untouched.
export async function placeCodOrder(
  serviceClient: AnySupabaseClient,
  params: PlaceCodOrderParams,
): Promise<PlacedOrder> {
  const { data, error } = await serviceClient.rpc("fn_place_cod_order", {
    p_draft_id: params.draftId,
    p_customer_id: params.customerId,
    p_yardage: params.pricing.yardageMetres,
    p_fabric_cost: params.pricing.fabricCost,
    p_stitch_cost: params.pricing.stitchCost,
    p_options_cost: params.pricing.optionsCost,
    p_total: params.pricing.total,
    p_lead_days: params.leadDays,
    p_options: params.options,
    p_delivery: params.delivery,
    p_idempotency_key: params.idempotencyKey,
    ...(params.placedBy ? { p_placed_by: params.placedBy } : {}),
  });
  if (error) throw error;

  const order = data as PlacedOrder;
  return { id: order.id, number: order.number, total: order.total, est_delivery_date: order.est_delivery_date };
}
