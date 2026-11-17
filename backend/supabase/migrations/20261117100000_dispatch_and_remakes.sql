-- Dispatch and remakes (FR-FUL-01..05, FR-PRD-06/07). Teammate to review.
--
-- Remakes
--   - A job can now fail QC for good: fn_advance_production_stage accepts
--     qc -> failed (QC only, reason required); the order stays in QC.
--   - fn_create_remake(job, metres lost, assignee): admin only. Records the
--     loss in production_remakes, opens a replacement job (already approved,
--     marked urgent) for the chosen tailor/QC, and moves the order back to
--     measurements_approved through fn_transition_order (new admin-only
--     in_qc -> measurements_approved branch, reason required), so it goes
--     through cutting again, which takes the new fabric off the roll.
--   - production_jobs.order_id was UNIQUE, which made a replacement job for
--     the same order impossible. Now: at most one job per order that hasn't
--     failed (partial unique index).
--
-- Dispatch (no customer "collection" option exists yet, so FR-FUL-06 is not here)
--   - dispatch_order_view: orders ready to ship / dispatched / delivered for
--     dispatch staff and admins: delivery address and contact, outfit,
--     shipment, and the cash the courier must collect on an unpaid COD order.
--     No other price or payment detail.
--   - fn_dispatch_order (existing) records courier + tracking and dispatches.
--   - fn_mark_delivered(order): shipment delivered + order delivered.
--   - fn_record_delivery_failure(order, reason): the order stays dispatched,
--     the shipment goes to delivery_failed (the reattempt state), attempts+1,
--     the customer is notified.
--   - fn_reattempt_delivery(order, courier, tracking): back out for delivery.

-- ---------------------------------------------------------------------------
-- fn_transition_order: + in_qc -> measurements_approved (admin, remake).
-- Otherwise unchanged from 20261019000000_initial_schema.sql.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- One live job per order; failed jobs stay for the record.
-- ---------------------------------------------------------------------------
alter table public.production_jobs drop constraint if exists production_jobs_order_id_key;
create unique index if not exists production_jobs_one_live_per_order
  on public.production_jobs (order_id) where stage <> 'failed';
create index if not exists production_jobs_order_idx on public.production_jobs (order_id);

-- ---------------------------------------------------------------------------
-- fn_advance_production_stage: + qc -> failed. Otherwise as in 20261117050000.
-- ---------------------------------------------------------------------------
create or replace function public.fn_advance_production_stage(
  p_job_id  uuid,
  p_to_stage public.production_stage,
  p_reason  text default null
)
returns public.production_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_job    public.production_jobs;
  v_from   public.production_stage;
  v_role   public.app_role;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not public.is_production_role() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = v_uid;

  select * into v_job from public.production_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  if v_job.assigned_to_id is distinct from v_uid then
    raise exception 'This job is not assigned to you' using errcode = '42501';
  end if;
  v_from := v_job.stage;

  -- fn_transition_order checks the role for each move and the cutting gate.
  if v_from = 'approved' and p_to_stage = 'cutting' then
    perform public.fn_transition_order(v_job.order_id, 'in_cutting', v_role, v_reason);
  elsif v_from = 'cutting' and p_to_stage = 'stitching' then
    perform public.fn_transition_order(v_job.order_id, 'in_stitching', v_role, v_reason);
  elsif v_from = 'stitching' and p_to_stage = 'qc' then
    perform public.fn_transition_order(v_job.order_id, 'in_qc', v_role, v_reason);
  elsif v_from = 'qc' and p_to_stage = 'passed' then
    perform public.fn_transition_order(v_job.order_id, 'ready_to_ship', v_role, v_reason);
  elsif v_from = 'qc' and p_to_stage = 'stitching' then
    if v_reason is null then
      raise exception 'A reason is required' using errcode = '22023';
    end if;
    perform public.fn_transition_order(v_job.order_id, 'in_stitching', v_role, v_reason);
  elsif v_from = 'qc' and p_to_stage = 'failed' then
    -- Can't be fixed by re-stitching: escalate to the admin for a remake
    -- (fn_create_remake). The order stays in QC until then.
    if v_role <> 'qc' then
      raise exception 'Only QC can send a job for remake' using errcode = '42501';
    end if;
    if v_reason is null then
      raise exception 'A reason is required' using errcode = '22023';
    end if;
  elsif v_from = 'pending' and p_to_stage = 'approved' then
    raise exception 'Approve the measurements first (fn_approve_for_production)' using errcode = '22023';
  else
    raise exception 'Cannot move a job from % to %', v_from, p_to_stage using errcode = '22023';
  end if;

  update public.production_jobs
     set stage = p_to_stage,
         started_at  = case when p_to_stage = 'cutting' and started_at is null then now() else started_at end,
         finished_at = case when p_to_stage in ('passed', 'failed') then now() else finished_at end
   where id = p_job_id
  returning * into v_job;

  insert into public.production_events (job_id, from_stage, to_stage, actor_id, reason)
  values (p_job_id, v_from, p_to_stage, v_uid, v_reason);

  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- fn_create_remake
-- ---------------------------------------------------------------------------
create or replace function public.fn_create_remake(
  p_job_id       uuid,
  p_metres_lost  numeric,
  p_assign_to    uuid
)
returns public.production_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_job    public.production_jobs;
  v_new    public.production_jobs;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can order a remake' using errcode = '42501';
  end if;
  if p_metres_lost is null or p_metres_lost < 0 or p_metres_lost > 100 then
    raise exception 'Enter the fabric lost in metres (0 to 100)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles
                  where id = p_assign_to and role in ('tailor', 'qc') and status = 'active') then
    raise exception 'Choose an active tailor or QC member' using errcode = '22023';
  end if;

  select * into v_job from public.production_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  if v_job.stage <> 'failed' then
    raise exception 'Only a job that failed QC can be remade' using errcode = '22023';
  end if;
  if exists (select 1 from public.production_remakes where original_job_id = v_job.id) then
    raise exception 'A remake has already been ordered for this job' using errcode = '22023';
  end if;

  select reason into v_reason from public.production_events
   where job_id = v_job.id and to_stage = 'failed'
   order by created_at desc limit 1;
  v_reason := coalesce(nullif(btrim(v_reason), ''), 'Failed quality check');

  perform public.fn_transition_order(v_job.order_id, 'measurements_approved', 'admin', 'Remake: ' || v_reason);

  insert into public.production_jobs (order_id, assigned_to_id, stage, priority)
  values (v_job.order_id, p_assign_to, 'approved', greatest(v_job.priority, 0) + 1)
  returning * into v_new;

  insert into public.production_events (job_id, from_stage, to_stage, actor_id, reason)
  values (v_new.id, null, 'approved', v_uid, 'Remake: ' || v_reason);

  insert into public.production_remakes (original_job_id, replacement_job_id, reason, fabric_metres_lost)
  values (v_job.id, v_new.id, v_reason, p_metres_lost);

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_uid, 'production.remake', 'production_jobs', v_new.id,
          jsonb_build_object('job_id', v_job.id),
          jsonb_build_object('replacement_job_id', v_new.id, 'fabric_metres_lost', p_metres_lost, 'reason', v_reason));

  return v_new;
end;
$$;

revoke execute on function public.fn_create_remake(uuid, numeric, uuid) from public, anon;
grant  execute on function public.fn_create_remake(uuid, numeric, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- dispatch_order_view (same pattern as production_order_view: the WHERE
-- clause is the access control; the view owner bypasses RLS underneath).
-- ---------------------------------------------------------------------------
create or replace view public.dispatch_order_view as
select o.id, o.number, o.status, o.created_at, o.est_delivery_date, o.delivery_address,
       o.payment_method,
       case when o.payment_method = 'cash_on_delivery' and o.payment_status = 'unpaid' then o.total end
         as cash_to_collect,
       p.full_name as customer_name, p.phone as customer_phone,
       i.template_name,
       coalesce(nullif(f.display_name, ''), f.name) as fabric_name,
       s.courier, s.tracking_ref, s.dispatched_at, s.delivered_at,
       s.status as shipment_status, coalesce(s.attempts, 0) as failed_attempts, s.last_failure_reason
from public.orders o
join public.profiles p on p.id = o.customer_id
left join lateral (select oi.template_name from public.order_items oi where oi.order_id = o.id limit 1) i on true
left join public.fabrics f on f.id = o.fabric_id
left join public.shipments s on s.order_id = o.id
where o.status in ('ready_to_ship', 'dispatched', 'delivered')
  and ((select public.is_dispatch()) or (select public.is_admin()));

revoke all on public.dispatch_order_view from anon;
grant select on public.dispatch_order_view to authenticated;

-- ---------------------------------------------------------------------------
-- Delivery outcomes
-- ---------------------------------------------------------------------------
create or replace function public.fn_mark_delivered(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role     public.app_role;
  v_shipment public.shipments;
begin
  if not public.is_dispatch() and not public.is_admin() then
    raise exception 'Only dispatch can confirm a delivery' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = (select auth.uid());

  select * into v_shipment from public.shipments where order_id = p_order_id for update;
  if not found or v_shipment.status <> 'dispatched' then
    raise exception 'This order is not out for delivery' using errcode = '22023';
  end if;

  update public.shipments set status = 'delivered', delivered_at = now() where id = v_shipment.id;
  return public.fn_transition_order(p_order_id, 'delivered', v_role);
end;
$$;

create or replace function public.fn_record_delivery_failure(p_order_id uuid, p_reason text)
returns public.shipments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_reason   text := nullif(btrim(p_reason), '');
  v_shipment public.shipments;
begin
  if not public.is_dispatch() and not public.is_admin() then
    raise exception 'Only dispatch can record a failed delivery' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into v_shipment from public.shipments where order_id = p_order_id for update;
  if not found or v_shipment.status <> 'dispatched' then
    raise exception 'This order is not out for delivery' using errcode = '22023';
  end if;

  update public.shipments
     set status = 'delivery_failed', attempts = attempts + 1, last_failure_reason = left(v_reason, 300)
   where id = v_shipment.id
  returning * into v_shipment;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_uid, 'shipment.delivery_failed', 'shipments', v_shipment.id,
          jsonb_build_object('status', 'dispatched'),
          jsonb_build_object('status', 'delivery_failed', 'reason', v_reason, 'attempts', v_shipment.attempts));
  perform public.fn_notify_order(p_order_id, 'delivery_failed', true, v_reason);

  return v_shipment;
end;
$$;

create or replace function public.fn_reattempt_delivery(p_order_id uuid, p_courier text, p_tracking_ref text)
returns public.shipments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier  text := nullif(btrim(p_courier), '');
  v_tracking text := nullif(btrim(p_tracking_ref), '');
  v_shipment public.shipments;
begin
  if not public.is_dispatch() and not public.is_admin() then
    raise exception 'Only dispatch can send an order out again' using errcode = '42501';
  end if;
  if v_courier is null or v_tracking is null then
    raise exception 'Record the courier and tracking reference first' using errcode = '22023';
  end if;

  select * into v_shipment from public.shipments where order_id = p_order_id for update;
  if not found or v_shipment.status <> 'delivery_failed' then
    raise exception 'This order has no failed delivery to retry' using errcode = '22023';
  end if;

  update public.shipments
     set status = 'dispatched', courier = left(v_courier, 80), tracking_ref = left(v_tracking, 80), dispatched_at = now()
   where id = v_shipment.id
  returning * into v_shipment;

  perform public.fn_notify_order(p_order_id, 'order_dispatched', true);
  return v_shipment;
end;
$$;

revoke execute on function public.fn_mark_delivered(uuid)                 from public, anon;
revoke execute on function public.fn_record_delivery_failure(uuid, text)  from public, anon;
revoke execute on function public.fn_reattempt_delivery(uuid, text, text) from public, anon;
grant  execute on function public.fn_mark_delivered(uuid)                 to authenticated;
grant  execute on function public.fn_record_delivery_failure(uuid, text)  to authenticated;
grant  execute on function public.fn_reattempt_delivery(uuid, text, text) to authenticated;
