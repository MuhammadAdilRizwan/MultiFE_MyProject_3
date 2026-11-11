-- Cash-on-delivery ordering (agreed with the client 2026-11-11, until a
-- payment gateway is chosen — SRS §3 Q5). fn_create_order_from_draft stays
-- the path for online payment; this is the parallel path for COD orders.
--
-- 1. orders.delivery_address: where the garment goes. The v2.0 schema had no
--    address anywhere; COD (and dispatch, FR-FUL-02) needs one.
-- 2. fn_place_cod_order: creates the order from a customer's draft in one
--    transaction — hard fabric reservation, order + snapshot, history,
--    pending COD payment row, production job, confirmation notification.

alter table public.orders
  add column delivery_address jsonb
    check (delivery_address is null or jsonb_typeof(delivery_address) = 'object');
    -- { full_name, phone, address_line, city }

-- Service-role only: the caller (the place-order server action) has already
-- checked the customer owns the draft and re-priced it from the server's own
-- read of the catalogue (FR-TPL-09, SDS §12.4) — so the amounts are trusted
-- here and never come from a browser. p_customer_id is checked against the
-- draft anyway, as a second guard.
--
-- Idempotent on p_idempotency_key (FR-AGT-08 style): a retried request with
-- the same key returns the order already created. A draft that already
-- became an order returns that order too, so it can't be ordered twice.
create or replace function public.fn_place_cod_order(
  p_draft_id        uuid,
  p_customer_id     uuid,
  p_yardage         numeric,
  p_fabric_cost     numeric,
  p_stitch_cost     numeric,
  p_options_cost    numeric,
  p_total           numeric,
  p_lead_days       integer,
  p_options         jsonb,
  p_delivery        jsonb,
  p_idempotency_key text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event    text;
  v_existing uuid;
  v_draft    public.order_drafts;
  v_fabric   public.fabrics;
  v_template public.dress_templates;
  v_profile  public.measurement_profiles;
  v_res      public.fabric_reservations;
  v_order    public.orders;
begin
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'An idempotency key is required' using errcode = '22023';
  end if;
  if p_delivery is null or jsonb_typeof(p_delivery) <> 'object' then
    raise exception 'A delivery address is required' using errcode = '22023';
  end if;
  if p_total is null or p_total <= 0 or p_yardage is null or p_yardage <= 0 then
    raise exception 'Order amount and fabric quantity must be positive' using errcode = '22023';
  end if;

  v_event := 'cod:' || p_idempotency_key;
  select order_id into v_existing from public.payments where event_id = v_event;
  if v_existing is not null then
    select * into v_order from public.orders where id = v_existing;
    return v_order;
  end if;

  select * into v_draft from public.order_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft not found' using errcode = 'P0002';
  end if;
  if v_draft.customer_id is distinct from p_customer_id then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select o.* into v_order
    from public.fabric_reservations r
    join public.orders o on o.id = r.order_id
   where r.order_draft_id = p_draft_id
   limit 1;
  if found then
    return v_order;
  end if;

  select * into v_fabric   from public.fabrics         where id = v_draft.fabric_id;
  select * into v_template from public.dress_templates where id = v_draft.template_id;
  if v_fabric.id is null or v_template.id is null then
    raise exception 'Pick a fabric and template first' using errcode = '22023';
  end if;
  if v_fabric.is_hidden then
    raise exception 'Fabric is not available' using errcode = '22023';
  end if;

  select * into v_profile from public.measurement_profiles where id = v_draft.measurement_profile_id;
  if v_profile.id is null or v_profile.customer_id <> p_customer_id or v_profile.confirmed_at is null then
    raise exception 'Measurements are not confirmed' using errcode = '22023';
  end if;

  -- Raises (and rolls everything back) when stock is short — FR-PAY-04.
  v_res := public.fn_take_hard_reservation(p_draft_id, v_fabric.id, p_yardage);

  insert into public.orders (
    customer_id, placed_by_id, order_channel, supplier_id, fabric_id, template_id,
    measurement_profile_id, measurements_confirmed_by_id, measurements_confirmed_by_role,
    measurements_confirmed_at, yardage_metres, fabric_cost, stitch_cost, options_cost, total,
    payment_method, payment_status, est_delivery_date, delivery_address
  )
  values (
    p_customer_id, p_customer_id, 'self_serve', v_fabric.supplier_id, v_fabric.id, v_template.id,
    v_profile.id, v_profile.confirmed_by_id, v_profile.confirmed_by_role,
    v_profile.confirmed_at, p_yardage, p_fabric_cost, p_stitch_cost, p_options_cost, p_total,
    'cash_on_delivery', 'unpaid', current_date + greatest(p_lead_days, 0), p_delivery
  )
  returning * into v_order;

  insert into public.order_items (order_id, template_id, template_name, options, measurements, unit_price)
  values (v_order.id, v_template.id, v_template.name, coalesce(p_options, '[]'::jsonb),
          v_profile.measurement_values, p_total);

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, actor_role)
  values (v_order.id, null, 'placed', p_customer_id, 'customer');

  insert into public.payments (order_id, kind, method, amount, status, event_id)
  values (v_order.id, 'charge', 'cash_on_delivery', p_total, 'pending', v_event);

  update public.fabric_reservations set order_id = v_order.id where id = v_res.id;
  update public.order_drafts set step = 'ordered' where id = p_draft_id;

  insert into public.production_jobs (order_id) values (v_order.id);

  perform public.fn_notify_order(v_order.id, 'order_placed');

  return v_order;
end;
$$;

revoke execute on function public.fn_place_cod_order(uuid, uuid, numeric, numeric, numeric, numeric, numeric, integer, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.fn_place_cod_order(uuid, uuid, numeric, numeric, numeric, numeric, numeric, integer, jsonb, jsonb, text)
  to service_role;
