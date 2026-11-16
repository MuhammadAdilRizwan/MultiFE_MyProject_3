-- fn_create_order_from_draft (D7, payment webhook / service-role only) has
-- never actually been called until the phase-6 production RLS fixture
-- exercised it for the first time: its order_channel value was built with a
-- bare `case when ... then 'agent_placed' else 'self_serve' end`, which
-- Postgres types as `text`. A CASE expression's result does not get the
-- same implicit literal-to-enum coercion a plain string literal gets in an
-- INSERT ... VALUES list, so every call failed with "column order_channel
-- is of type public.order_channel but expression is of type text". Fixed by
-- casting the case expression explicitly. Re-declared in full (not edited
-- in place) because db-setup.mjs tracks applied migrations by filename and
-- will not re-run an already-applied file; the existing grants on this
-- function (service_role only) are untouched by create or replace.
create or replace function public.fn_create_order_from_draft(
  p_draft_id    uuid,
  p_amount      numeric,
  p_gateway_ref text,
  p_event_id    text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft    public.order_drafts;
  v_fabric   public.fabrics;
  v_template public.dress_templates;
  v_profile  public.measurement_profiles;
  v_res      public.fabric_reservations;
  v_existing uuid;
  v_order    public.orders;
begin
  select order_id into v_existing from public.payments where event_id = p_event_id;
  if v_existing is not null then
    select * into v_order from public.orders where id = v_existing;
    return v_order;
  end if;

  select * into v_draft from public.order_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft not found' using errcode = 'P0002';
  end if;

  select * into v_fabric   from public.fabrics        where id = v_draft.fabric_id;
  select * into v_template from public.dress_templates where id = v_draft.template_id;
  select * into v_profile  from public.measurement_profiles where id = v_draft.measurement_profile_id;

  if v_profile.confirmed_at is null then
    raise exception 'Measurements are not confirmed' using errcode = '22023';
  end if;

  select * into v_res from public.fabric_reservations
   where order_draft_id = p_draft_id and kind = 'hard' and status = 'active'
   for update;
  if not found then
    raise exception 'No hard fabric reservation held for this draft' using errcode = '22023';
  end if;

  insert into public.orders (
    customer_id, placed_by_id, order_channel, agent_id, supplier_id, fabric_id, template_id,
    measurement_profile_id, measurements_confirmed_by_id, measurements_confirmed_by_role,
    measurements_confirmed_at, yardage_metres, total, payment_status, est_delivery_date
  )
  values (
    v_draft.customer_id,
    coalesce(v_draft.agent_id, v_draft.customer_id),
    (case when v_draft.agent_id is not null then 'agent_placed' else 'self_serve' end)::public.order_channel,
    v_draft.agent_id, v_fabric.supplier_id, v_fabric.id, v_template.id,
    v_profile.id, v_profile.confirmed_by_id, v_profile.confirmed_by_role,
    v_profile.confirmed_at, v_res.metres, p_amount, 'paid',
    current_date + v_template.lead_days
  )
  returning * into v_order;

  insert into public.order_items (order_id, template_id, template_name, options, measurements, unit_price)
  values (v_order.id, v_template.id, v_template.name, v_draft.options, v_profile.measurement_values, p_amount);

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, actor_role)
  values (v_order.id, null, 'placed', null, 'customer');

  insert into public.payments (order_id, kind, method, amount, status, gateway_ref, event_id)
  values (v_order.id, 'charge', 'online', p_amount, 'paid', p_gateway_ref, p_event_id);

  update public.fabric_reservations set order_id = v_order.id where id = v_res.id;

  insert into public.production_jobs (order_id) values (v_order.id);

  perform public.fn_notify_order(v_order.id, 'order_placed');

  return v_order;
end;
$$;
