-- FR-AI-17: a tailor's measurement correction that changes the fabric needed
-- (and so possibly the price) holds the order and goes to the customer as a
-- change, instead of being absorbed silently. Teammate to review.
--
-- Until now only a change of more than 2 cm went to the customer
-- (FR-AI-16), and even then the order kept its original yardage and price:
-- cutting took the old metres off the roll and the customer paid the old
-- total. Now:
--
-- A change counts when it moves the fabric needed by at least
-- fn_yardage_change_threshold() (0.05 m); smaller ones stay inside the
-- order's wastage margin.
--
-- 1. fn_order_yardage(order, measurements): the template's yardage formula
--    (SDS §6.2, same maths as rules/estimateYardage.ts) for that order's
--    fabric and chosen options. A correction's effect is the difference
--    between the corrected set and the customer's confirmed set, added to the
--    order's yardage — so a later edit to the template formula doesn't make an
--    unchanged set look like a change.
-- 2. fn_clamp_order_total: the client's PKR 10,000–20,000 rule
--    (rules/priceOrder.ts ORDER_PRICE_BOUNDS; the RLS test keeps them equal).
-- 3. measurement_corrections.yardage_before / yardage_after (staff may see
--    metres) and measurement_correction_prices (total before/after): only the
--    customer, the agent who placed the order and admins can read prices
--    (FR-AUTH-06: production staff see no prices).
-- 4. fn_job_correction_effect(job, values): for the assigned tailor/QC — does
--    this set change the fabric, and does it need the customer? Metres only.
-- 5. fn_request_measurement_correction: also for small changes that change
--    the fabric; refuses when the extra fabric isn't in stock, or when a
--    paid order's price would change (no online payments yet; an admin
--    handles it). Emails "measurement_correction_price" when the fabric
--    changes.
-- 6. fn_respond_measurement_correction: accepting a fabric change updates the
--    order's yardage, fabric cost, total, the item price, the fabric hold and
--    the cash-on-delivery amount, re-checking stock; audited as
--    order.price_changed.
-- 7. fn_approve_for_production: refuses a set that changes the fabric unless
--    the customer accepted exactly those values.

-- -----------------------------------------------------------------------------
-- 1. Yardage for an order and a set of measurements
-- -----------------------------------------------------------------------------
create or replace function public.fn_order_yardage(p_order_id uuid, p_measurements jsonb)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_formula     jsonb;
  v_directional boolean;
  v_selected    text[];
  v_consumption numeric;
  v_coef        record;
  v_margin      numeric;
begin
  select t.yardage_formula, coalesce((f.properties ->> 'directional_pattern')::boolean, false)
    into v_formula, v_directional
    from public.orders o
    join public.dress_templates t on t.id = o.template_id
    join public.fabrics f on f.id = o.fabric_id
   where o.id = p_order_id;
  if v_formula is null or jsonb_typeof(v_formula -> 'base_metres') <> 'number' then
    return null;
  end if;

  -- The chosen option values: cash-on-delivery orders snapshot a list of
  -- { group, value, ... }; fn_create_order_from_draft copies the draft's
  -- { group: value } object.
  select coalesce(array_agg(v), '{}') into v_selected
    from (
      select opt ->> 'value' as v
        from public.order_items i,
             jsonb_array_elements(case when jsonb_typeof(i.options) = 'array' then i.options else '[]'::jsonb end) opt
       where i.order_id = p_order_id
      union all
      select o.value #>> '{}'
        from public.order_items i,
             jsonb_each(case when jsonb_typeof(i.options) = 'object' then i.options else '{}'::jsonb end) o
       where i.order_id = p_order_id
    ) s
   where v is not null;

  v_consumption := (v_formula ->> 'base_metres')::numeric;
  for v_coef in select key, value from jsonb_each(coalesce(v_formula -> 'coefficients', '{}'::jsonb))
  loop
    if jsonb_typeof(v_coef.value) <> 'number' then
      continue;
    end if;
    if jsonb_typeof(p_measurements -> v_coef.key) = 'number' then
      v_consumption := v_consumption + (v_coef.value)::text::numeric * (p_measurements ->> v_coef.key)::numeric;
    elsif v_coef.key = any (v_selected) then
      v_consumption := v_consumption + (v_coef.value)::text::numeric;
    end if;
  end loop;

  v_margin := coalesce((v_formula ->> 'wastage_margin')::numeric, 0) + case when v_directional then 0.05 else 0 end;
  return round(v_consumption * (1 + v_margin), 3);
end;
$$;

revoke execute on function public.fn_order_yardage(uuid, jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Price bounds
-- -----------------------------------------------------------------------------
create or replace function public.fn_clamp_order_total(p_subtotal numeric)
returns numeric
language sql immutable
as $$ select least(greatest(p_subtotal, 10000), 20000) $$;

-- The smallest change in fabric that counts as a change to the order (like
-- the 2 cm measurement threshold, the one place it's configured). Smaller
-- differences sit inside the wastage margin every order already carries
-- (e.g. 0.5 cm on the chest is about 7 mm of fabric).
create or replace function public.fn_yardage_change_threshold()
returns numeric
language sql immutable
as $$ select 0.05::numeric $$;

-- What a set of measurements does to an order: yardage before/after and the
-- new fabric cost and total (same rate per metre the order was priced at).
-- Measured from the set the order is priced for now: the last correction the
-- customer accepted, else their own confirmed set.
create or replace function public.fn_correction_effect(p_order_id uuid, p_values jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order     public.orders;
  v_reference jsonb;
  v_base      numeric;
  v_new       numeric;
  v_after     numeric;
  v_rate      numeric;
  v_fabric    numeric;
  v_total     numeric;
begin
  select * into v_order from public.orders where id = p_order_id;
  select c.proposed into v_reference from public.measurement_corrections c
   where c.order_id = p_order_id and c.status = 'accepted'
   order by c.responded_at desc nulls last limit 1;
  if v_reference is null then
    select measurement_values into v_reference from public.measurement_profiles where id = v_order.measurement_profile_id;
  end if;
  v_base := public.fn_order_yardage(p_order_id, coalesce(v_reference, '{}'::jsonb));
  v_new  := public.fn_order_yardage(p_order_id, p_values);

  if v_base is null or v_new is null or v_order.yardage_metres is null
     or abs(v_new - v_base) < public.fn_yardage_change_threshold() then
    return jsonb_build_object('changes_fabric', false, 'yardage_before', v_order.yardage_metres, 'yardage_after', v_order.yardage_metres);
  end if;

  v_after  := round(v_order.yardage_metres + (v_new - v_base), 3);
  v_rate   := case when v_order.yardage_metres > 0 then v_order.fabric_cost / v_order.yardage_metres else 0 end;
  v_fabric := round(v_after * v_rate, 2);
  v_total  := public.fn_clamp_order_total(round(v_fabric + v_order.stitch_cost + v_order.options_cost, 2));

  return jsonb_build_object(
    'changes_fabric', true,
    'yardage_before', v_order.yardage_metres,
    'yardage_after', v_after,
    'fabric_cost_after', v_fabric,
    'total_before', v_order.total,
    'total_after', v_total
  );
end;
$$;

revoke execute on function public.fn_correction_effect(uuid, jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Where the change is kept
-- -----------------------------------------------------------------------------
alter table public.measurement_corrections
  add column yardage_before numeric(10,3),
  add column yardage_after  numeric(10,3);

create table public.measurement_correction_prices (
  correction_id     uuid primary key references public.measurement_corrections (id) on delete cascade,
  order_id          uuid not null references public.orders (id) on delete cascade,
  fabric_cost_after numeric(12,2) not null check (fabric_cost_after >= 0),
  total_before      numeric(12,2) not null check (total_before >= 0),
  total_after       numeric(12,2) not null check (total_after >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index measurement_correction_prices_order_idx on public.measurement_correction_prices (order_id);

create trigger set_updated_at before update on public.measurement_correction_prices
  for each row execute function public.set_updated_at();

alter table public.measurement_correction_prices enable row level security;
create policy "measurement_correction_prices: customer reads own" on public.measurement_correction_prices
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = measurement_correction_prices.order_id and o.customer_id = (select auth.uid())));
create policy "measurement_correction_prices: agent reads placed by self" on public.measurement_correction_prices
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = measurement_correction_prices.order_id and o.agent_id = (select auth.uid())));
create policy "measurement_correction_prices: admin read" on public.measurement_correction_prices
  for select to authenticated using ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- 4. What the tailor sees before sending (metres only)
-- -----------------------------------------------------------------------------
create or replace function public.fn_job_correction_effect(p_job_id uuid, p_values jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_job       public.production_jobs;
  v_order     public.orders;
  v_effect    jsonb;
  v_big       boolean;
  v_accepted  boolean;
begin
  if not public.is_tailor_or_qc() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_job from public.production_jobs where id = p_job_id;
  if not found or v_job.assigned_to_id is distinct from v_uid then
    raise exception 'This job is not assigned to you' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Measurements must be a JSON object' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = v_job.order_id;

  v_effect := public.fn_correction_effect(v_order.id, p_values);
  v_big := public.fn_max_measurement_change(
             (select measurement_values from public.measurement_profiles where id = v_order.measurement_profile_id),
             p_values) > public.fn_measurement_correction_threshold();
  v_accepted := exists (select 1 from public.measurement_corrections c
                         where c.job_id = v_job.id and c.status = 'accepted' and c.proposed = p_values);

  return jsonb_build_object(
    'changes_fabric', (v_effect ->> 'changes_fabric')::boolean,
    'yardage_before', v_effect -> 'yardage_before',
    'yardage_after',  v_effect -> 'yardage_after',
    'needs_customer', (v_big or (v_effect ->> 'changes_fabric')::boolean) and not v_accepted
  );
end;
$$;

revoke execute on function public.fn_job_correction_effect(uuid, jsonb) from public, anon;
grant execute on function public.fn_job_correction_effect(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Sending a correction (as in 20261117200000, plus the fabric change)
-- -----------------------------------------------------------------------------
create or replace function public.fn_request_measurement_correction(p_job_id uuid, p_values jsonb, p_reason text)
returns public.measurement_corrections
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_reason   text := nullif(btrim(p_reason), '');
  v_job      public.production_jobs;
  v_order    public.orders;
  v_template public.dress_templates;
  v_original jsonb;
  v_field    jsonb;
  v_num      numeric;
  v_errors   text[] := '{}';
  v_row      public.measurement_corrections;
  v_effect   jsonb;
  v_changes  boolean;
  v_extra    numeric;
  v_left     numeric;
begin
  if not public.is_tailor_or_qc() then
    raise exception 'Only a tailor or QC can correct measurements' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into v_job from public.production_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  if v_job.assigned_to_id is distinct from v_uid then
    raise exception 'This job is not assigned to you' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = v_job.order_id for update;
  if v_order.status <> 'received_at_hub' or v_job.stage <> 'pending' then
    raise exception 'Measurements can only be corrected before they are approved' using errcode = '22023';
  end if;

  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Measurements must be a JSON object' using errcode = '22023';
  end if;
  select * into v_template from public.dress_templates where id = v_order.template_id;
  for v_field in select * from jsonb_array_elements(v_template.required_measurements)
  loop
    if jsonb_typeof(p_values -> (v_field ->> 'key')) is distinct from 'number' then
      v_errors := v_errors || format('%s is missing', coalesce(v_field ->> 'label', v_field ->> 'key'));
      continue;
    end if;
    v_num := (p_values ->> (v_field ->> 'key'))::numeric;
    if ((v_field ->> 'min') is not null and v_num < (v_field ->> 'min')::numeric)
       or ((v_field ->> 'max') is not null and v_num > (v_field ->> 'max')::numeric) then
      v_errors := v_errors || format('%s must be between %s and %s',
                                     coalesce(v_field ->> 'label', v_field ->> 'key'), v_field ->> 'min', v_field ->> 'max');
    end if;
  end loop;
  if cardinality(v_errors) > 0 then
    raise exception 'Invalid measurements: %', array_to_string(v_errors, '; ') using errcode = '22023';
  end if;

  select measurement_values into v_original from public.measurement_profiles where id = v_order.measurement_profile_id;
  v_effect  := public.fn_correction_effect(v_order.id, p_values);
  v_changes := (v_effect ->> 'changes_fabric')::boolean;

  if public.fn_max_measurement_change(v_original, p_values) <= public.fn_measurement_correction_threshold() and not v_changes then
    raise exception 'Small corrections don''t need the customer: approve the measurements directly' using errcode = '22023';
  end if;

  if v_changes then
    if v_order.payment_status <> 'unpaid'
       and (v_effect ->> 'total_after')::numeric <> (v_effect ->> 'total_before')::numeric then
      raise exception 'This order is already paid, so the price can''t change here. Ask an admin to handle it' using errcode = '22023';
    end if;
    v_extra := (v_effect ->> 'yardage_after')::numeric - (v_effect ->> 'yardage_before')::numeric;
    if v_extra > 0 then
      select f.stock_metres - public.fn_fabric_reserved_metres(f.id) into v_left from public.fabrics f where f.id = v_order.fabric_id;
      if v_left < v_extra then
        raise exception 'Not enough fabric for this change: % m more needed, % m left. Tell the admin', round(v_extra, 2), greatest(round(v_left, 2), 0)
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  update public.measurement_corrections set status = 'superseded'
   where job_id = v_job.id and status in ('pending', 'declined');

  insert into public.measurement_corrections (order_id, job_id, original, proposed, reason, requested_by_id, yardage_before, yardage_after)
  values (v_order.id, v_job.id, coalesce(v_original, '{}'::jsonb), p_values, left(v_reason, 500), v_uid,
          case when v_changes then (v_effect ->> 'yardage_before')::numeric end,
          case when v_changes then (v_effect ->> 'yardage_after')::numeric end)
  returning * into v_row;

  if v_changes then
    insert into public.measurement_correction_prices (correction_id, order_id, fabric_cost_after, total_before, total_after)
    values (v_row.id, v_order.id, (v_effect ->> 'fabric_cost_after')::numeric,
            (v_effect ->> 'total_before')::numeric, (v_effect ->> 'total_after')::numeric);
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_uid, 'measurements.correction_requested', 'measurement_corrections', v_row.id,
          null, jsonb_build_object('order_id', v_order.id, 'reason', v_row.reason,
                                   'yardage_before', v_row.yardage_before, 'yardage_after', v_row.yardage_after));
  perform public.fn_notify_order(v_order.id,
                                 case when v_changes then 'measurement_correction_price' else 'measurement_correction' end,
                                 true, v_row.reason);

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Answering (as in 20261117200000, plus applying an accepted fabric change)
-- -----------------------------------------------------------------------------
create or replace function public.fn_respond_measurement_correction(p_correction_id uuid, p_accept boolean, p_note text default null)
returns public.measurement_corrections
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_note  text := nullif(btrim(p_note), '');
  v_row   public.measurement_corrections;
  v_order public.orders;
  v_price public.measurement_correction_prices;
  v_extra numeric;
  v_left  numeric;
begin
  select * into v_row from public.measurement_corrections where id = p_correction_id for update;
  if not found then
    raise exception 'Correction not found' using errcode = 'P0002';
  end if;
  select * into v_order from public.orders where id = v_row.order_id for update;
  if not (v_order.customer_id = v_uid or (v_order.agent_id = v_uid and public.is_agent())) then
    raise exception 'Only the customer or their agent can answer this' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This correction has already been answered' using errcode = '22023';
  end if;
  if not p_accept and v_note is null then
    raise exception 'Tell us what''s wrong so we can contact you' using errcode = '22023';
  end if;

  -- FR-AI-17: accepting a fabric change makes it the order's: yardage, price,
  -- the fabric hold and the cash to collect. Stock is checked again.
  select * into v_price from public.measurement_correction_prices where correction_id = v_row.id;
  if p_accept and v_price.correction_id is not null then
    if v_order.status <> 'received_at_hub' then
      raise exception 'This order has moved on; the change can''t be applied now' using errcode = '22023';
    end if;
    if v_order.payment_status <> 'unpaid' and v_price.total_after <> v_order.total then
      raise exception 'This order is already paid, so the price can''t change here. We''ll contact you' using errcode = '22023';
    end if;
    v_extra := v_row.yardage_after - coalesce(v_order.yardage_metres, 0);
    if v_extra > 0 then
      select f.stock_metres - public.fn_fabric_reserved_metres(f.id) into v_left from public.fabrics f where f.id = v_order.fabric_id;
      if v_left < v_extra then
        raise exception 'There isn''t enough of this fabric left for the change. We''ll contact you' using errcode = 'P0001';
      end if;
    end if;

    update public.orders
       set yardage_metres = v_row.yardage_after, fabric_cost = v_price.fabric_cost_after, total = v_price.total_after
     where id = v_order.id;
    update public.order_items set unit_price = v_price.total_after where order_id = v_order.id;
    update public.fabric_reservations set metres = v_row.yardage_after
     where order_id = v_order.id and kind = 'hard' and status = 'active';
    update public.payments set amount = v_price.total_after
     where order_id = v_order.id and kind = 'charge' and method = 'cash_on_delivery' and status = 'pending';

    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values (v_uid, 'order.price_changed', 'orders', v_order.id,
            jsonb_build_object('yardage_metres', v_order.yardage_metres, 'total', v_order.total),
            jsonb_build_object('yardage_metres', v_row.yardage_after, 'total', v_price.total_after,
                               'correction_id', v_row.id));
  end if;

  update public.measurement_corrections
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_by_id = v_uid, responded_at = now(), response_note = left(v_note, 500)
   where id = v_row.id
  returning * into v_row;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_uid, 'measurements.correction_' || v_row.status, 'measurement_corrections', v_row.id,
          jsonb_build_object('status', 'pending'), jsonb_build_object('status', v_row.status, 'note', v_row.response_note));
  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Approval (as in 20261117200000, plus the fabric-change gate)
-- -----------------------------------------------------------------------------
create or replace function public.fn_approve_for_production(
  p_job_id  uuid,
  p_values  jsonb,
  p_reason  text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_role     public.app_role;
  v_job      public.production_jobs;
  v_order    public.orders;
  v_template public.dress_templates;
  v_field    jsonb;
  v_key      text;
  v_label    text;
  v_num      numeric;
  v_errors   text[] := '{}';
  v_accepted boolean;
begin
  if not public.is_tailor_or_qc() then
    raise exception 'Only a tailor or QC can approve measurements for production' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = v_uid;

  select * into v_job from public.production_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  if v_job.assigned_to_id is distinct from v_uid then
    raise exception 'This job is not assigned to you' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = v_job.order_id for update;
  select * into v_template from public.dress_templates where id = v_order.template_id;

  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Measurements must be a JSON object' using errcode = '22023';
  end if;

  for v_field in select * from jsonb_array_elements(v_template.required_measurements)
  loop
    v_key   := v_field ->> 'key';
    v_label := coalesce(v_field ->> 'label', v_key);

    if jsonb_typeof(p_values -> v_key) is distinct from 'number' then
      v_errors := v_errors || format('%s is missing', v_label);
      continue;
    end if;

    v_num := (p_values ->> v_key)::numeric;
    if ((v_field ->> 'min') is not null and v_num < (v_field ->> 'min')::numeric)
       or ((v_field ->> 'max') is not null and v_num > (v_field ->> 'max')::numeric) then
      v_errors := v_errors || format('%s must be between %s and %s',
                                     v_label, v_field ->> 'min', v_field ->> 'max');
    end if;
  end loop;

  if cardinality(v_errors) > 0 then
    raise exception 'Invalid measurements: %', array_to_string(v_errors, '; ') using errcode = '22023';
  end if;

  v_accepted := exists (select 1 from public.measurement_corrections c
                         where c.job_id = v_job.id and c.status = 'accepted' and c.proposed = p_values);

  -- FR-AI-16: a correction beyond the threshold needs the customer's OK for
  -- exactly these values (fn_request_measurement_correction).
  if public.fn_max_measurement_change(
       (select measurement_values from public.measurement_profiles where id = v_order.measurement_profile_id),
       p_values) > public.fn_measurement_correction_threshold()
     and not v_accepted then
    raise exception 'These corrections need the customer''s approval first' using errcode = '22023';
  end if;

  -- FR-AI-17: so does any set that changes the fabric needed (and the price).
  if (public.fn_correction_effect(v_order.id, p_values) ->> 'changes_fabric')::boolean and not v_accepted then
    raise exception 'These measurements change the fabric needed, so the customer has to accept them first' using errcode = '22023';
  end if;

  -- The customer's confirmed set stays on measurement_profiles; the job's
  -- approved (possibly corrected) set goes on the order item (FR-AI-15).
  update public.order_items set measurements = p_values where order_id = v_order.id;

  perform set_config('multife.approval_write', 'on', true);
  update public.orders
     set production_approved_by_id = v_uid,
         production_approved_at    = now()
   where id = v_order.id;
  perform set_config('multife.approval_write', 'off', true);

  update public.production_jobs set stage = 'approved' where id = v_job.id;
  insert into public.production_events (job_id, from_stage, to_stage, actor_id, reason)
  values (v_job.id, v_job.stage, 'approved', v_uid, nullif(btrim(p_reason), ''));

  return public.fn_transition_order(v_order.id, 'measurements_approved', v_role, p_reason);
end;
$$;
