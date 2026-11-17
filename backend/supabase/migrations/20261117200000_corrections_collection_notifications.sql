-- Measurement corrections, collection orders, email sending
-- (FR-AI-16, FR-NOT-05, FR-FUL-06, FR-NOT-02/03). Teammate to review.
--
-- Corrections (FR-AI-16)
--   - fn_measurement_correction_threshold(): the one place the threshold is
--     configured (2 cm on any single measurement).
--   - measurement_corrections: what the tailor/QC proposed against the
--     customer's confirmed set, why, and the customer's answer.
--   - fn_request_measurement_correction(job, values, reason): the assigned
--     tailor/QC sends a big correction to the customer; the order stays at
--     "fabric received" (paused before cutting) and the customer is emailed.
--   - fn_respond_measurement_correction(id, accept, note): the customer, or
--     the agent who placed the order, accepts or declines.
--   - fn_approve_for_production now refuses a beyond-threshold change unless
--     the customer accepted exactly those values.
--
-- Collection (FR-FUL-06)
--   - orders.fulfilment_method, derived from delivery_address.method
--     ('collection' or delivery), so fn_place_cod_order is unchanged.
--   - fn_mark_ready_for_collection / fn_mark_collected for dispatch; the
--     handover goes ready_to_ship -> delivered through fn_transition_order
--     (new branch, collection orders only). fn_dispatch_order refuses them.
--   - dispatch_order_view gains fulfilment_method.
--
-- Email (FR-NOT-02/03)
--   - fn_claim_notifications / fn_finish_notification (service role): the
--     sender leases a batch of pending emails, then records sent, or failed
--     with exponential back-off; after 5 attempts the row is 'failed' and
--     shown to the admin. fn_admin_retry_notification puts it back.

-- ---------------------------------------------------------------------------
-- Corrections
-- ---------------------------------------------------------------------------
create or replace function public.fn_measurement_correction_threshold()
returns numeric
language sql immutable
as $$ select 2.0::numeric $$;

-- Largest absolute change on any measurement present in both sets.
create or replace function public.fn_max_measurement_change(p_confirmed jsonb, p_proposed jsonb)
returns numeric
language sql immutable
as $$
  select coalesce(max(abs((p.value)::numeric - (c.value)::numeric)), 0)
  from jsonb_each_text(coalesce(p_proposed, '{}'::jsonb)) p
  join jsonb_each_text(coalesce(p_confirmed, '{}'::jsonb)) c on c.key = p.key
  where p.value ~ '^-?[0-9]+(\.[0-9]+)?$' and c.value ~ '^-?[0-9]+(\.[0-9]+)?$';
$$;

create table public.measurement_corrections (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  job_id           uuid not null references public.production_jobs (id) on delete cascade,
  original         jsonb not null,
  proposed         jsonb not null,
  reason           text not null,
  status           text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'superseded')),
  requested_by_id  uuid references public.profiles (id) on delete set null,
  responded_by_id  uuid references public.profiles (id) on delete set null,
  responded_at     timestamptz,
  response_note    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index measurement_corrections_order_idx on public.measurement_corrections (order_id, created_at desc);
create index measurement_corrections_job_idx on public.measurement_corrections (job_id, created_at desc);

alter table public.measurement_corrections enable row level security;
create policy "measurement_corrections: customer reads own" on public.measurement_corrections
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = measurement_corrections.order_id and o.customer_id = (select auth.uid())));
create policy "measurement_corrections: agent reads placed by self" on public.measurement_corrections
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = measurement_corrections.order_id and o.agent_id = (select auth.uid())));
create policy "measurement_corrections: assigned staff read" on public.measurement_corrections
  for select to authenticated
  using (public.is_production_role() and public.is_assigned_job_order(order_id));
create policy "measurement_corrections: admin all" on public.measurement_corrections
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

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
  select * into v_order from public.orders where id = v_job.order_id;
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
  if public.fn_max_measurement_change(v_original, p_values) <= public.fn_measurement_correction_threshold() then
    raise exception 'Small corrections don''t need the customer: approve the measurements directly' using errcode = '22023';
  end if;

  update public.measurement_corrections set status = 'superseded'
   where job_id = v_job.id and status in ('pending', 'declined');

  insert into public.measurement_corrections (order_id, job_id, original, proposed, reason, requested_by_id)
  values (v_order.id, v_job.id, coalesce(v_original, '{}'::jsonb), p_values, left(v_reason, 500), v_uid)
  returning * into v_row;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_uid, 'measurements.correction_requested', 'measurement_corrections', v_row.id,
          null, jsonb_build_object('order_id', v_order.id, 'reason', v_row.reason));
  perform public.fn_notify_order(v_order.id, 'measurement_correction', true, v_row.reason);

  return v_row;
end;
$$;

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
begin
  select * into v_row from public.measurement_corrections where id = p_correction_id for update;
  if not found then
    raise exception 'Correction not found' using errcode = 'P0002';
  end if;
  select * into v_order from public.orders where id = v_row.order_id;
  if not (v_order.customer_id = v_uid or (v_order.agent_id = v_uid and public.is_agent())) then
    raise exception 'Only the customer or their agent can answer this' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This correction has already been answered' using errcode = '22023';
  end if;
  if not p_accept and v_note is null then
    raise exception 'Tell us what''s wrong so we can contact you' using errcode = '22023';
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

revoke execute on function public.fn_request_measurement_correction(uuid, jsonb, text) from public, anon;
revoke execute on function public.fn_respond_measurement_correction(uuid, boolean, text) from public, anon;
grant  execute on function public.fn_request_measurement_correction(uuid, jsonb, text) to authenticated;
grant  execute on function public.fn_respond_measurement_correction(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Collection
-- ---------------------------------------------------------------------------
alter table public.orders
  add column fulfilment_method text generated always as (
    case when delivery_address ->> 'method' = 'collection' then 'collection' else 'delivery' end
  ) stored;

-- fn_approve_for_production: as in 20261117050000 + the FR-AI-16 gate.
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

  -- FR-AI-16: a correction beyond the threshold needs the customer's OK for
  -- exactly these values (fn_request_measurement_correction).
  if public.fn_max_measurement_change(
       (select measurement_values from public.measurement_profiles where id = v_order.measurement_profile_id),
       p_values) > public.fn_measurement_correction_threshold()
     and not exists (select 1 from public.measurement_corrections c
                      where c.job_id = v_job.id and c.status = 'accepted' and c.proposed = p_values) then
    raise exception 'These corrections need the customer''s approval first' using errcode = '22023';
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

-- fn_transition_order: as in 20261117100000 + ready_to_ship -> delivered for collection.
create or replace function public.fn_transition_order(
  p_order_id   uuid,
  p_to_status  public.order_status,
  p_actor_role public.app_role,
  p_reason     text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_order       public.orders;
  v_from        public.order_status;
  v_is_service  boolean := v_uid is null and coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_is_admin    boolean := public.is_admin();
  v_is_customer boolean;
  v_is_agent    boolean;
  v_profile_role public.app_role;
  v_reason      text := nullif(btrim(p_reason), '');
  v_shipment    public.shipments;
  v_pay_status  public.order_payment_status;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  v_from := v_order.status;

  if v_uid is not null then
    select role into v_profile_role from public.profiles where id = v_uid;
    if v_profile_role is distinct from p_actor_role and not v_is_admin then
      raise exception 'Actor role does not match the caller' using errcode = '42501';
    end if;
  elsif not v_is_service then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  v_is_customer := v_uid is not null and v_order.customer_id = v_uid;
  v_is_agent    := v_uid is not null and v_order.agent_id = v_uid and public.is_agent();

  if v_from in ('delivered', 'cancelled', 'failed') then
    raise exception 'Order % is already %', v_order.number, v_from using errcode = '22023';
  end if;

  if p_to_status = 'cancelled' then
    if v_is_admin then
      if v_reason is null then
        raise exception 'A reason is required' using errcode = '22023';
      end if;
    elsif (v_is_customer or v_is_agent)
          and v_from in ('placed', 'fabric_secured', 'received_at_hub', 'measurements_approved') then
      null;  -- FR-CUS-16: cancellation closes once cutting starts
    else
      raise exception 'This order can no longer be cancelled' using errcode = '42501';
    end if;

  elsif p_to_status = 'failed' then
    if not v_is_admin then
      raise exception 'Only an admin can fail an order' using errcode = '42501';
    end if;
    if v_reason is null then
      raise exception 'A reason is required' using errcode = '22023';
    end if;

  else
    if v_from = 'placed' and p_to_status = 'fabric_secured' then
      if not (v_is_admin or v_is_service) then
        raise exception 'Only the system or an admin can confirm fabric is secured' using errcode = '42501';
      end if;

    elsif v_from = 'fabric_secured' and p_to_status = 'received_at_hub' then
      if not (p_actor_role in ('tailor', 'qc') or v_is_admin) then
        raise exception 'Only warehouse staff can record receipt' using errcode = '42501';
      end if;

    elsif v_from = 'received_at_hub' and p_to_status = 'measurements_approved' then
      if not public.is_tailor_or_qc() then
        raise exception 'Only a tailor or QC can approve measurements' using errcode = '42501';
      end if;
      if v_order.production_approved_at is null then
        raise exception 'Record production approval first (fn_approve_for_production)' using errcode = '22023';
      end if;

    elsif v_from = 'measurements_approved' and p_to_status = 'in_cutting' then
      -- SDS v2 §7.3: the cutting gate — the one guard enforced redundantly and
      -- the one check that counts. No role, whatever it claims, bypasses this.
      if v_order.production_approved_at is null then
        raise exception 'Cutting is refused: no recorded production approval' using errcode = '22023';
      end if;
      if not public.is_tailor_or_qc() then
        raise exception 'Only a tailor or QC can start cutting' using errcode = '42501';
      end if;

    elsif v_from = 'in_cutting' and p_to_status = 'in_stitching' then
      if not public.is_tailor_or_qc() then
        raise exception 'Not allowed' using errcode = '42501';
      end if;

    elsif v_from = 'in_stitching' and p_to_status = 'in_qc' then
      if not public.is_tailor_or_qc() then
        raise exception 'Not allowed' using errcode = '42501';
      end if;

    elsif v_from = 'in_qc' and p_to_status = 'ready_to_ship' then
      if p_actor_role <> 'qc' and not v_is_admin then
        raise exception 'Only QC can pass a job' using errcode = '42501';
      end if;

    elsif v_from = 'in_qc' and p_to_status = 'in_stitching' then
      if p_actor_role <> 'qc' and not v_is_admin then
        raise exception 'Only QC can fail a job' using errcode = '42501';
      end if;
      if v_reason is null then
        raise exception 'A reason is required' using errcode = '22023';
      end if;

    elsif v_from = 'ready_to_ship' and p_to_status = 'dispatched' then
      if p_actor_role <> 'dispatch' and not v_is_admin then
        raise exception 'Only dispatch can mark an order dispatched' using errcode = '42501';
      end if;
      select * into v_shipment from public.shipments where order_id = v_order.id;
      if not found or v_shipment.courier is null or v_shipment.tracking_ref is null then
        raise exception 'Record the courier and tracking reference first' using errcode = '22023';
      end if;

    elsif v_from = 'in_qc' and p_to_status = 'measurements_approved' then
      -- Remake (FR-PRD-06/07): an admin sends a garment that failed QC back
      -- to cutting with a new job (fn_create_remake). Measurements stay approved.
      if not v_is_admin then
        raise exception 'Only an admin can order a remake' using errcode = '42501';
      end if;
      if v_reason is null then
        raise exception 'A reason is required' using errcode = '22023';
      end if;

    elsif v_from = 'ready_to_ship' and p_to_status = 'delivered' then
      -- FR-FUL-06: a collection order completes when it's handed over
      -- (fn_mark_collected); it never goes out with a courier.
      if v_order.fulfilment_method <> 'collection' then
        raise exception 'Cannot move an order from % to %', v_from, p_to_status using errcode = '22023';
      end if;
      if not (p_actor_role = 'dispatch' or v_is_admin) then
        raise exception 'Only dispatch can hand over an order' using errcode = '42501';
      end if;
      if not exists (select 1 from public.shipments
                      where order_id = v_order.id and status = 'ready_for_collection') then
        raise exception 'Mark the order ready for collection first' using errcode = '22023';
      end if;

    elsif v_from = 'dispatched' and p_to_status = 'delivered' then
      if not (p_actor_role = 'dispatch' or v_is_admin or v_is_service) then
        raise exception 'Not allowed' using errcode = '42501';
      end if;

    else
      raise exception 'Cannot move an order from % to %', v_from, p_to_status using errcode = '22023';
    end if;
  end if;

  -- FR-ORD-10: a cancelled or failed order with a captured payment is refunded.
  v_pay_status := v_order.payment_status;
  if p_to_status in ('cancelled', 'failed') and v_order.payment_status = 'paid' then
    v_pay_status := 'refund_pending';
    insert into public.payments (order_id, kind, method, amount, status)
    values (v_order.id, 'refund', v_order.payment_method, v_order.total, 'pending');
  end if;

  perform set_config('multife.status_transition', 'on', true);
  update public.orders
     set status = p_to_status, payment_status = v_pay_status,
         cancelled_reason = case when p_to_status in ('cancelled', 'failed') then v_reason else cancelled_reason end
   where id = p_order_id
  returning * into v_order;
  perform set_config('multife.status_transition', 'off', true);

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, actor_role, reason)
  values (v_order.id, v_from, p_to_status, v_uid, p_actor_role, v_reason);

  if p_to_status = 'cancelled' then
    update public.fabric_reservations set status = 'released'
     where order_id = v_order.id and status = 'active';
    perform public.fn_notify_order(v_order.id, 'order_cancelled', false, v_reason);
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values (v_uid, 'order.cancel', 'orders', v_order.id,
            jsonb_build_object('status', v_from), jsonb_build_object('status', 'cancelled', 'reason', v_reason));
  elsif p_to_status = 'failed' then
    update public.fabric_reservations set status = 'released'
     where order_id = v_order.id and status = 'active';
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values (v_uid, 'order.fail', 'orders', v_order.id,
            jsonb_build_object('status', v_from), jsonb_build_object('status', 'failed', 'reason', v_reason));
  elsif p_to_status = 'in_cutting' then
    update public.fabrics set stock_metres = stock_metres - v_order.yardage_metres where id = v_order.fabric_id;
  elsif p_to_status = 'dispatched' then
    perform public.fn_notify_order(v_order.id, 'order_dispatched', true);
  elsif p_to_status = 'delivered' then
    perform public.fn_notify_order(v_order.id, 'order_delivered', true);
  end if;

  return v_order;
end;
$$;

-- fn_dispatch_order: as in the initial schema + refuses collection orders.
create or replace function public.fn_dispatch_order(
  p_order_id uuid,
  p_courier  text,
  p_tracking_ref text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_dispatch() and not public.is_admin() then
    raise exception 'Only dispatch can dispatch an order' using errcode = '42501';
  end if;
  if exists (select 1 from public.orders where id = p_order_id and fulfilment_method = 'collection') then
    raise exception 'This order is for collection, not courier delivery' using errcode = '22023';
  end if;

  insert into public.shipments (order_id, courier, tracking_ref, status, dispatched_at)
  values (p_order_id, p_courier, p_tracking_ref, 'dispatched', now())
  on conflict (order_id) do update
    set courier = excluded.courier, tracking_ref = excluded.tracking_ref,
        status = 'dispatched', dispatched_at = now();

  return public.fn_transition_order(p_order_id, 'dispatched', 'dispatch');
end;
$$;

create or replace function public.fn_mark_ready_for_collection(p_order_id uuid)
returns public.shipments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    public.orders;
  v_shipment public.shipments;
begin
  if not public.is_dispatch() and not public.is_admin() then
    raise exception 'Only dispatch can prepare an order for collection' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.fulfilment_method <> 'collection' or v_order.status <> 'ready_to_ship' then
    raise exception 'This order is not waiting to be collected' using errcode = '22023';
  end if;

  insert into public.shipments (order_id, courier, status)
  values (v_order.id, 'Collection', 'ready_for_collection')
  on conflict (order_id) do update set status = 'ready_for_collection', courier = 'Collection'
  returning * into v_shipment;

  perform public.fn_notify_order(v_order.id, 'ready_for_collection', true);
  return v_shipment;
end;
$$;

create or replace function public.fn_mark_collected(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role  public.app_role;
  v_order public.orders;
begin
  if not public.is_dispatch() and not public.is_admin() then
    raise exception 'Only dispatch can hand over an order' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = (select auth.uid());

  -- fn_transition_order checks it's a collection order that's ready.
  v_order := public.fn_transition_order(p_order_id, 'delivered', v_role);
  update public.shipments set status = 'completed', delivered_at = now() where order_id = p_order_id;
  return v_order;
end;
$$;

revoke execute on function public.fn_mark_ready_for_collection(uuid) from public, anon;
revoke execute on function public.fn_mark_collected(uuid)            from public, anon;
grant  execute on function public.fn_mark_ready_for_collection(uuid) to authenticated;
grant  execute on function public.fn_mark_collected(uuid)            to authenticated;

-- Same view as 20261117100000, plus fulfilment_method at the end.
create or replace view public.dispatch_order_view as
select o.id, o.number, o.status, o.created_at, o.est_delivery_date, o.delivery_address,
       o.payment_method,
       case when o.payment_method = 'cash_on_delivery' and o.payment_status = 'unpaid' then o.total end
         as cash_to_collect,
       p.full_name as customer_name, p.phone as customer_phone,
       i.template_name,
       coalesce(nullif(f.display_name, ''), f.name) as fabric_name,
       s.courier, s.tracking_ref, s.dispatched_at, s.delivered_at,
       s.status as shipment_status, coalesce(s.attempts, 0) as failed_attempts, s.last_failure_reason,
       o.fulfilment_method
from public.orders o
join public.profiles p on p.id = o.customer_id
left join lateral (select oi.template_name from public.order_items oi where oi.order_id = o.id limit 1) i on true
left join public.fabrics f on f.id = o.fabric_id
left join public.shipments s on s.order_id = o.id
where o.status in ('ready_to_ship', 'dispatched', 'delivered')
  and ((select public.is_dispatch()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Email sending (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.fn_claim_notifications(p_limit integer default 20)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.notification_outbox n
     set attempts = n.attempts + 1,
         next_attempt_at = now() + interval '10 minutes'  -- lease; finish sets the real time
   where n.id in (
     select id from public.notification_outbox
      where status = 'pending' and channel = 'email' and next_attempt_at <= now()
      order by created_at
      limit greatest(1, least(p_limit, 100))
      for update skip locked)
  returning n.*;
end;
$$;

create or replace function public.fn_finish_notification(p_id uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ok then
    update public.notification_outbox
       set status = 'sent', sent_at = now(), last_error = null
     where id = p_id;
  else
    update public.notification_outbox
       set status = case when attempts >= 5 then 'failed'::public.outbox_status else 'pending'::public.outbox_status end,
           next_attempt_at = now() + make_interval(mins => power(2, least(attempts, 10))::int),
           last_error = left(coalesce(p_error, 'Unknown error'), 300)
     where id = p_id;
  end if;
end;
$$;

create or replace function public.fn_admin_retry_notification(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can retry a notification' using errcode = '42501';
  end if;
  update public.notification_outbox
     set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null
   where id = p_id and status = 'failed';
  if not found then
    raise exception 'Only a failed notification can be retried' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.fn_claim_notifications(integer)            from public, anon, authenticated;
revoke execute on function public.fn_finish_notification(uuid, boolean, text) from public, anon, authenticated;
grant  execute on function public.fn_claim_notifications(integer)            to service_role;
grant  execute on function public.fn_finish_notification(uuid, boolean, text) to service_role;
revoke execute on function public.fn_admin_retry_notification(uuid) from public, anon;
grant  execute on function public.fn_admin_retry_notification(uuid) to authenticated;
