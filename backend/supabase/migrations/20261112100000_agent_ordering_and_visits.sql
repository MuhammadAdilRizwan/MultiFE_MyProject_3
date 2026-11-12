-- Agent-assisted ordering and measurement visits (SRS §6 FR-AGT-03/05/07/08/10/12,
-- FR-AI-12/13). Agents act through these SECURITY DEFINER functions rather than
-- broad table policies, so every agent action is checked (assigned customer,
-- consent on record) and written to the audit log in the same transaction.
--
-- Agent identity: order_drafts.agent_id, orders.agent_id, order_consents.agent_id
-- and measurement_visits.agent_id all hold the agent's PROFILE id (auth.uid()),
-- matching the existing RLS ("orders: agent reads placed by self" etc.).
-- Assignment is checked through agent_customers / is_assigned_agent_for().

-- -----------------------------------------------------------------------------
-- Helper: has this agent recorded the customer's consent for this draft?
-- -----------------------------------------------------------------------------
create or replace function public.fn_draft_has_agent_consent(p_draft_id uuid, p_agent_profile_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.order_consents c
      join public.order_drafts d on d.id = p_draft_id
     where c.consent_type = 'agent_on_behalf'
       and c.agent_id = p_agent_profile_id
       and c.customer_id = d.customer_id
       and c.evidence ->> 'draft_id' = p_draft_id::text
  );
$$;
revoke execute on function public.fn_draft_has_agent_consent(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- FR-AGT-07: the customer's consent, recorded by the agent before they take
-- measurements or place an order. Idempotent per draft.
-- -----------------------------------------------------------------------------
create or replace function public.fn_agent_record_consent(p_draft_id uuid, p_method text)
returns public.order_consents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_draft   public.order_drafts;
  v_consent public.order_consents;
begin
  if p_method not in ('in_person', 'phone_call', 'signed_form') then
    raise exception 'Choose how the customer gave consent' using errcode = '22023';
  end if;

  select * into v_draft from public.order_drafts where id = p_draft_id;
  if not found or v_draft.agent_id is distinct from v_uid
     or not public.is_assigned_agent_for(v_draft.customer_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_consent from public.order_consents
   where consent_type = 'agent_on_behalf' and agent_id = v_uid
     and customer_id = v_draft.customer_id and evidence ->> 'draft_id' = p_draft_id::text
   limit 1;
  if found then
    return v_consent;
  end if;

  insert into public.order_consents (customer_id, agent_id, consent_type, evidence)
  values (v_draft.customer_id, v_uid, 'agent_on_behalf',
          jsonb_build_object('draft_id', p_draft_id, 'method', p_method,
                             'statement', 'Customer agreed to the agent taking their measurements and placing this order for them.'))
  returning * into v_consent;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (v_uid, 'agent.consent_recorded', 'order_consents', v_consent.id,
          jsonb_build_object('customer_id', v_draft.customer_id, 'draft_id', p_draft_id, 'method', p_method));

  return v_consent;
end;
$$;

-- -----------------------------------------------------------------------------
-- FR-AI-12/13 (agent path): the agent saves and confirms the measurements they
-- took for the customer. Requires consent first. The profile is the
-- customer's (customer_id), confirmed by the agent with role 'agent'.
-- -----------------------------------------------------------------------------
create or replace function public.fn_agent_save_measurements(p_draft_id uuid, p_values jsonb)
returns public.measurement_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_draft   public.order_drafts;
  v_profile public.measurement_profiles;
begin
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    raise exception 'Measurements must be a JSON object' using errcode = '22023';
  end if;

  select * into v_draft from public.order_drafts where id = p_draft_id for update;
  if not found or v_draft.agent_id is distinct from v_uid
     or not public.is_assigned_agent_for(v_draft.customer_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not public.fn_draft_has_agent_consent(p_draft_id, v_uid) then
    raise exception 'Record the customer''s consent first' using errcode = '22023';
  end if;

  -- Reuse the draft's own agent-taken profile while no order points at it.
  select * into v_profile from public.measurement_profiles
   where id = v_draft.measurement_profile_id and source = 'agent'
     and not exists (select 1 from public.orders o where o.measurement_profile_id = measurement_profiles.id);

  if found then
    update public.measurement_profiles
       set measurement_values = p_values, confirmed_by_id = v_uid,
           confirmed_by_role = 'agent', confirmed_at = now()
     where id = v_profile.id
    returning * into v_profile;
  else
    insert into public.measurement_profiles
      (customer_id, label, measurement_values, source, confirmed_by_id, confirmed_by_role, confirmed_at)
    values (v_draft.customer_id, 'Taken by agent', p_values, 'agent', v_uid, 'agent', now())
    returning * into v_profile;
  end if;

  update public.order_drafts
     set measurement_profile_id = v_profile.id, step = 'measurements'
   where id = p_draft_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (v_uid, 'agent.measurements_confirmed', 'measurement_profiles', v_profile.id,
          jsonb_build_object('customer_id', v_draft.customer_id, 'draft_id', p_draft_id));

  return v_profile;
end;
$$;

revoke execute on function public.fn_agent_record_consent(uuid, text)      from public, anon;
revoke execute on function public.fn_agent_save_measurements(uuid, jsonb)  from public, anon;
grant  execute on function public.fn_agent_record_consent(uuid, text)      to authenticated;
grant  execute on function public.fn_agent_save_measurements(uuid, jsonb)  to authenticated;

-- -----------------------------------------------------------------------------
-- fn_place_cod_order, now also for agent-placed orders (FR-AGT-03/05/08/10).
-- New trailing parameter p_placed_by: null for a customer's own order; the
-- agent's profile id for an agent-placed one. Still service-role only.
-- -----------------------------------------------------------------------------
drop function if exists public.fn_place_cod_order(uuid, uuid, numeric, numeric, numeric, numeric, numeric, integer, jsonb, jsonb, text);

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
  p_idempotency_key text,
  p_placed_by       uuid default null
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
  v_is_agent boolean;
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

  v_is_agent := v_draft.agent_id is not null;
  if v_is_agent then
    if p_placed_by is distinct from v_draft.agent_id then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.agent_customers ac
        join public.agents a on a.id = ac.agent_id
        join public.profiles p on p.id = a.profile_id
       where a.profile_id = p_placed_by and a.status = 'active' and p.status = 'active'
         and ac.customer_id = p_customer_id
    ) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if not public.fn_draft_has_agent_consent(p_draft_id, p_placed_by) then
      raise exception 'Record the customer''s consent first' using errcode = '22023';
    end if;
  elsif p_placed_by is not null and p_placed_by <> p_customer_id then
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
    customer_id, placed_by_id, order_channel, agent_id, supplier_id, fabric_id, template_id,
    measurement_profile_id, measurements_confirmed_by_id, measurements_confirmed_by_role,
    measurements_confirmed_at, yardage_metres, fabric_cost, stitch_cost, options_cost, total,
    payment_method, payment_status, est_delivery_date, delivery_address
  )
  values (
    p_customer_id,
    case when v_is_agent then p_placed_by else p_customer_id end,
    case when v_is_agent then 'agent_placed'::public.order_channel else 'self_serve'::public.order_channel end,
    case when v_is_agent then p_placed_by else null end,
    v_fabric.supplier_id, v_fabric.id, v_template.id,
    v_profile.id, v_profile.confirmed_by_id, v_profile.confirmed_by_role,
    v_profile.confirmed_at, p_yardage, p_fabric_cost, p_stitch_cost, p_options_cost, p_total,
    'cash_on_delivery', 'unpaid', current_date + greatest(p_lead_days, 0), p_delivery
  )
  returning * into v_order;

  insert into public.order_items (order_id, template_id, template_name, options, measurements, unit_price)
  values (v_order.id, v_template.id, v_template.name, coalesce(p_options, '[]'::jsonb),
          v_profile.measurement_values, p_total);

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, actor_role)
  values (v_order.id, null, 'placed',
          case when v_is_agent then p_placed_by else p_customer_id end,
          case when v_is_agent then 'agent'::public.app_role else 'customer'::public.app_role end);

  insert into public.payments (order_id, kind, method, amount, status, event_id)
  values (v_order.id, 'charge', 'cash_on_delivery', p_total, 'pending', v_event);

  update public.fabric_reservations set order_id = v_order.id where id = v_res.id;
  update public.order_drafts set step = 'ordered' where id = p_draft_id;

  if v_is_agent then
    update public.order_consents set order_id = v_order.id
     where consent_type = 'agent_on_behalf' and agent_id = p_placed_by
       and customer_id = p_customer_id and evidence ->> 'draft_id' = p_draft_id::text;
    insert into public.audit_log (actor_id, action, entity, entity_id, after)
    values (p_placed_by, 'agent.order_placed', 'orders', v_order.id,
            jsonb_build_object('customer_id', p_customer_id, 'number', v_order.number, 'total', p_total));
  end if;

  insert into public.production_jobs (order_id) values (v_order.id);

  perform public.fn_notify_order(v_order.id, 'order_placed');

  return v_order;
end;
$$;

revoke execute on function public.fn_place_cod_order(uuid, uuid, numeric, numeric, numeric, numeric, numeric, integer, jsonb, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_place_cod_order(uuid, uuid, numeric, numeric, numeric, numeric, numeric, integer, jsonb, jsonb, text, uuid)
  to service_role;

-- -----------------------------------------------------------------------------
-- FR-AGT-12: measurement visits — an agent books a visit for a customer who
-- can't complete a scan, then records the measurements taken there.
-- -----------------------------------------------------------------------------
create table public.measurement_visits (
  id                     uuid primary key default gen_random_uuid(),
  customer_id            uuid not null references public.profiles (id) on delete cascade,
  agent_id               uuid not null references public.profiles (id) on delete cascade,  -- agent's profile id
  scheduled_for          timestamptz not null,
  address                text not null check (length(btrim(address)) between 5 and 300),
  notes                  text check (notes is null or length(notes) <= 500),
  status                 text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  measurement_profile_id uuid references public.measurement_profiles (id) on delete set null,
  completed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index measurement_visits_agent_idx    on public.measurement_visits (agent_id, scheduled_for);
create index measurement_visits_customer_idx on public.measurement_visits (customer_id);

create trigger set_updated_at before update on public.measurement_visits
  for each row execute function public.set_updated_at();

alter table public.measurement_visits enable row level security;

-- Reads only; agents write through the functions below (audited).
create policy "measurement_visits: agent reads own for assigned customers" on public.measurement_visits
  for select to authenticated
  using (agent_id = (select auth.uid()) and public.is_assigned_agent_for(customer_id));
create policy "measurement_visits: customer reads own" on public.measurement_visits
  for select to authenticated using (customer_id = (select auth.uid()));
create policy "measurement_visits: admin all" on public.measurement_visits
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Book a visit. Consent: the customer asked for the visit (recorded with it).
create or replace function public.fn_agent_book_visit(
  p_customer_id   uuid,
  p_scheduled_for timestamptz,
  p_address       text,
  p_notes         text default null
)
returns public.measurement_visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_visit public.measurement_visits;
begin
  if not public.is_assigned_agent_for(p_customer_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_scheduled_for is null or p_scheduled_for < now() - interval '1 hour' then
    raise exception 'Choose a date and time in the future' using errcode = '22023';
  end if;

  insert into public.measurement_visits (customer_id, agent_id, scheduled_for, address, notes)
  values (p_customer_id, v_uid, p_scheduled_for, btrim(p_address), nullif(btrim(coalesce(p_notes, '')), ''))
  returning * into v_visit;

  insert into public.order_consents (customer_id, agent_id, consent_type, evidence)
  values (p_customer_id, v_uid, 'agent_on_behalf',
          jsonb_build_object('visit_id', v_visit.id, 'method', 'visit_requested',
                             'statement', 'Customer asked for a measurement visit by their agent.'));

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (v_uid, 'agent.visit_booked', 'measurement_visits', v_visit.id,
          jsonb_build_object('customer_id', p_customer_id, 'scheduled_for', p_scheduled_for));

  return v_visit;
end;
$$;

-- Record the measurements taken at a visit: a confirmed profile for the
-- customer (source 'agent'), which their next order is prefilled from.
create or replace function public.fn_agent_record_visit_measurements(p_visit_id uuid, p_values jsonb)
returns public.measurement_visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_visit   public.measurement_visits;
  v_profile public.measurement_profiles;
begin
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    raise exception 'Measurements must be a JSON object' using errcode = '22023';
  end if;

  select * into v_visit from public.measurement_visits where id = p_visit_id for update;
  if not found or v_visit.agent_id <> v_uid or not public.is_assigned_agent_for(v_visit.customer_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_visit.status <> 'scheduled' then
    raise exception 'This visit is already closed' using errcode = '22023';
  end if;

  insert into public.measurement_profiles
    (customer_id, label, measurement_values, source, confirmed_by_id, confirmed_by_role, confirmed_at)
  values (v_visit.customer_id, 'Home visit', p_values, 'agent', v_uid, 'agent', now())
  returning * into v_profile;

  update public.measurement_visits
     set status = 'completed', completed_at = now(), measurement_profile_id = v_profile.id
   where id = p_visit_id
  returning * into v_visit;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (v_uid, 'agent.visit_measurements_recorded', 'measurement_visits', p_visit_id,
          jsonb_build_object('customer_id', v_visit.customer_id, 'measurement_profile_id', v_profile.id));

  return v_visit;
end;
$$;

create or replace function public.fn_agent_cancel_visit(p_visit_id uuid)
returns public.measurement_visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_visit public.measurement_visits;
begin
  select * into v_visit from public.measurement_visits where id = p_visit_id for update;
  if not found or v_visit.agent_id <> v_uid or not public.is_assigned_agent_for(v_visit.customer_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_visit.status <> 'scheduled' then
    raise exception 'This visit is already closed' using errcode = '22023';
  end if;

  update public.measurement_visits set status = 'cancelled' where id = p_visit_id returning * into v_visit;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (v_uid, 'agent.visit_cancelled', 'measurement_visits', p_visit_id,
          jsonb_build_object('customer_id', v_visit.customer_id));

  return v_visit;
end;
$$;

revoke execute on function public.fn_agent_book_visit(uuid, timestamptz, text, text)        from public, anon;
revoke execute on function public.fn_agent_record_visit_measurements(uuid, jsonb)           from public, anon;
revoke execute on function public.fn_agent_cancel_visit(uuid)                               from public, anon;
grant  execute on function public.fn_agent_book_visit(uuid, timestamptz, text, text)        to authenticated;
grant  execute on function public.fn_agent_record_visit_measurements(uuid, jsonb)           to authenticated;
grant  execute on function public.fn_agent_cancel_visit(uuid)                               to authenticated;
