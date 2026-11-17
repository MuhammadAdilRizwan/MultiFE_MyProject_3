-- Admin tools (FR-ADM-05, FR-ADM-06, FR-ADM-10, FR-AGT-13). Teammate to review.
--
-- 1. fn_admin_set_role: change a user's role from Admin -> Users. Admin only,
--    never your own; refuses to move a tailor/QC who still holds open jobs;
--    making someone an agent creates (or reactivates) their agents row with
--    a unique code; leaving the agent role suspends that row. Audited.
--    Store contacts are not set here: they need a store, so they're invited.
-- 2. order_notes + orders.dispute_opened_at: internal notes on an order and
--    a simple dispute state (open / resolved), written only through
--    fn_admin_add_order_note, which audits each one (UC-12). Admin-only.
-- 3. fn_admin_agent_activity: per-agent customers, orders and value for the
--    admin's agent view, computed in SQL (FR-AGT-13).

-- 1. -------------------------------------------------------------------------
create or replace function public.fn_admin_set_role(
  p_user_id    uuid,
  p_role       public.app_role,
  p_agent_code text default null
)
returns public.app_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_from  public.app_role;
  v_code  text := upper(nullif(btrim(coalesce(p_agent_code, '')), ''));
  v_open  integer;
  v_agent public.agents;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;
  if p_role = 'supplier_contact' then
    raise exception 'Store contacts need a store: invite them from Invite users' using errcode = '22023';
  end if;

  select role into v_from from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if v_from = p_role then
    return v_from;
  end if;

  if v_from in ('tailor', 'qc') then
    select count(*) into v_open
    from public.production_jobs j
    join public.orders o on o.id = j.order_id
    where j.assigned_to_id = p_user_id
      and j.stage not in ('passed', 'failed')
      and o.status not in ('cancelled', 'failed', 'delivered');
    if v_open > 0 then
      raise exception 'Reassign their % open job(s) first', v_open using errcode = '22023';
    end if;
  end if;

  select * into v_agent from public.agents where profile_id = p_user_id for update;
  if p_role = 'agent' then
    if v_code is not null and v_code !~ '^[A-Z0-9-]{3,20}$' then
      raise exception 'Agent code: 3 to 20 letters, digits or dashes' using errcode = '22023';
    end if;
    if not found then
      if v_code is null then
        raise exception 'Give the new agent a code, e.g. AG-012' using errcode = '22023';
      end if;
      begin
        insert into public.agents (profile_id, code, status) values (p_user_id, v_code, 'active');
      exception when unique_violation then
        raise exception 'That agent code is already used' using errcode = '22023';
      end;
    else
      begin
        update public.agents set status = 'active', code = coalesce(v_code, code) where id = v_agent.id;
      exception when unique_violation then
        raise exception 'That agent code is already used' using errcode = '22023';
      end;
    end if;
  elsif found then
    update public.agents set status = 'suspended' where id = v_agent.id;
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_uid, 'user.role_change', 'profiles', p_user_id,
          jsonb_build_object('role', v_from),
          jsonb_build_object('role', p_role) || case when p_role = 'agent'
            then jsonb_build_object('agent_code', (select code from public.agents where profile_id = p_user_id))
            else '{}'::jsonb end);
  return p_role;
end;
$$;

revoke execute on function public.fn_admin_set_role(uuid, public.app_role, text) from public, anon;
grant  execute on function public.fn_admin_set_role(uuid, public.app_role, text) to authenticated;

-- 2. -------------------------------------------------------------------------
alter table public.orders add column if not exists dispute_opened_at timestamptz;

create table public.order_notes (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  kind       text not null default 'note' check (kind in ('note', 'dispute_opened', 'dispute_resolved')),
  body       text not null check (length(body) between 3 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_notes_order_idx on public.order_notes (order_id, created_at);

alter table public.order_notes enable row level security;
create policy "order_notes: admin read" on public.order_notes
  for select to authenticated using ((select public.is_admin()));

create or replace function public.fn_admin_add_order_note(p_order_id uuid, p_kind text, p_body text)
returns public.order_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_body  text := btrim(coalesce(p_body, ''));
  v_order public.orders;
  v_note  public.order_notes;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('note', 'dispute_opened', 'dispute_resolved') then
    raise exception 'Unknown note type' using errcode = '22023';
  end if;
  if length(v_body) < 3 or length(v_body) > 1000 then
    raise exception 'Write a note of 3 to 1000 characters' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if p_kind = 'dispute_opened' and v_order.dispute_opened_at is not null then
    raise exception 'A dispute is already open on this order' using errcode = '22023';
  end if;
  if p_kind = 'dispute_resolved' and v_order.dispute_opened_at is null then
    raise exception 'There is no open dispute on this order' using errcode = '22023';
  end if;

  insert into public.order_notes (order_id, author_id, kind, body)
  values (p_order_id, v_uid, p_kind, v_body)
  returning * into v_note;

  if p_kind = 'dispute_opened' then
    update public.orders set dispute_opened_at = now() where id = p_order_id;
  elsif p_kind = 'dispute_resolved' then
    update public.orders set dispute_opened_at = null where id = p_order_id;
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_uid,
          case p_kind when 'note' then 'order.note' when 'dispute_opened' then 'order.dispute_open' else 'order.dispute_resolve' end,
          'orders', p_order_id, null, jsonb_build_object('note_id', v_note.id, 'body', v_body));
  return v_note;
end;
$$;

revoke execute on function public.fn_admin_add_order_note(uuid, text, text) from public, anon;
grant  execute on function public.fn_admin_add_order_note(uuid, text, text) to authenticated;

-- 3. -------------------------------------------------------------------------
create or replace function public.fn_admin_agent_activity()
returns table (
  agent_id         uuid,
  profile_id       uuid,
  code             text,
  region           text,
  agent_status     text,
  full_name        text,
  email            text,
  customers        bigint,
  orders_total     bigint,
  orders_open      bigint,
  orders_delivered bigint,
  orders_cancelled bigint,
  order_value      numeric,
  visits_done      bigint,
  last_order_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select a.id, a.profile_id, a.code, a.region, a.status, p.full_name, p.email,
         (select count(*) from public.agent_customers ac where ac.agent_id = a.id),
         count(o.id),
         count(o.id) filter (where o.status not in ('delivered', 'cancelled', 'failed')),
         count(o.id) filter (where o.status = 'delivered'),
         count(o.id) filter (where o.status in ('cancelled', 'failed')),
         coalesce(sum(o.total) filter (where o.status not in ('cancelled', 'failed')), 0),
         (select count(*) from public.measurement_visits v where v.agent_id = a.profile_id and v.status = 'completed'),
         max(o.created_at)
  from public.agents a
  join public.profiles p on p.id = a.profile_id
  left join public.orders o on o.agent_id = a.profile_id
  group by a.id, p.full_name, p.email
  order by count(o.id) desc, p.full_name;
end;
$$;

revoke execute on function public.fn_admin_agent_activity() from public, anon;
grant  execute on function public.fn_admin_agent_activity() to authenticated;
