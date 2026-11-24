-- FR-AUTH-09: a customer asks to delete their account; an admin carries it out.
--
-- Past orders can't be removed (orders.customer_id is "on delete restrict":
-- the workshop, refunds and the books need them), so deleting an account
-- means removing the person, not the rows:
--   * sign-in is removed: auth email, phone, password, identities, sessions
--     and MFA factors are wiped and the auth user is banned and marked
--     deleted (Supabase treats deleted_at as "no such user");
--   * the profile keeps its id (orders point at it) but loses name, email,
--     phone and saved address, is suspended and stamped deleted_at;
--   * saved measurement sets, unfinished drafts, measurement visits and
--     agent assignments are deleted;
--   * the customer's orders keep the garment details and their measurement
--     snapshot, but the delivery name, phone and address are wiped (only the
--     delivery/collection method stays), and their emails are removed from
--     the outbox.
-- Consent records and the audit log are kept (they're the legal record).
--
-- 1. account_deletion_requests: one pending request per user. Customers read
--    their own, admins read all; writes only through the functions below.
-- 2. profiles.deleted_at + trigger: set only by fn_admin_complete_account_
--    deletion; a deleted profile can never be reactivated, re-roled or
--    un-deleted, whoever tries.
-- 3. fn_request_account_deletion / fn_withdraw_account_deletion (customer),
--    fn_admin_decline_account_deletion / fn_admin_complete_account_deletion
--    (admin). Every step is audited. Completion is refused while the customer
--    has an order still in progress.

-- -----------------------------------------------------------------------------
-- 1. Requests
-- -----------------------------------------------------------------------------
create table public.account_deletion_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  status          text not null default 'pending'
    check (status in ('pending', 'withdrawn', 'declined', 'completed')),
  reason          text check (reason is null or length(reason) <= 500),
  requested_at    timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by_id  uuid references public.profiles (id) on delete set null,
  admin_note      text check (admin_note is null or length(admin_note) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index account_deletion_requests_one_pending
  on public.account_deletion_requests (user_id) where status = 'pending';
create index account_deletion_requests_user_idx on public.account_deletion_requests (user_id, requested_at desc);
create index account_deletion_requests_status_idx on public.account_deletion_requests (status, requested_at);
create index account_deletion_requests_resolved_by_idx on public.account_deletion_requests (resolved_by_id);

create trigger set_updated_at before update on public.account_deletion_requests
  for each row execute function public.set_updated_at();

alter table public.account_deletion_requests enable row level security;

create policy "account_deletion_requests: read own" on public.account_deletion_requests
  for select to authenticated using (user_id = (select auth.uid()));
create policy "account_deletion_requests: admin read" on public.account_deletion_requests
  for select to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2. profiles.deleted_at
-- -----------------------------------------------------------------------------
alter table public.profiles add column deleted_at timestamptz;

create or replace function public.guard_deleted_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is distinct from old.deleted_at
     and coalesce(current_setting('multife.account_deletion', true), '') <> 'on' then
    raise exception 'Accounts are deleted only through fn_admin_complete_account_deletion'
      using errcode = '42501';
  end if;
  if old.deleted_at is not null
     and (new.status is distinct from old.status or new.role is distinct from old.role) then
    raise exception 'This account was deleted' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_deleted_profile before update on public.profiles
  for each row execute function public.guard_deleted_profile();

-- Orders a customer still has in progress (not delivered, cancelled or failed).
create or replace function public.fn_customer_open_order_count(p_customer_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.orders
   where customer_id = p_customer_id
     and status not in ('delivered', 'cancelled', 'failed');
$$;

revoke execute on function public.fn_customer_open_order_count(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3a. Customer: ask, withdraw
-- -----------------------------------------------------------------------------
create or replace function public.fn_request_account_deletion(p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id     uuid;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles
     where id = v_uid and role = 'customer' and status = 'active' and deleted_at is null
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters' using errcode = '22023';
  end if;

  -- Asking twice is harmless: the open request stands.
  select id into v_id from public.account_deletion_requests
   where user_id = v_uid and status = 'pending';
  if found then
    return v_id;
  end if;

  insert into public.account_deletion_requests (user_id, reason)
  values (v_uid, v_reason)
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (v_uid, 'user.deletion_requested', 'profiles', v_uid,
          jsonb_build_object('request_id', v_id, 'reason', v_reason));

  return v_id;
end;
$$;

revoke execute on function public.fn_request_account_deletion(text) from public, anon;
grant execute on function public.fn_request_account_deletion(text) to authenticated;

create or replace function public.fn_withdraw_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update public.account_deletion_requests
     set status = 'withdrawn', resolved_at = now(), resolved_by_id = v_uid
   where user_id = v_uid and status = 'pending'
  returning id into v_id;
  if v_id is null then
    return false;
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (v_uid, 'user.deletion_withdrawn', 'profiles', v_uid, jsonb_build_object('request_id', v_id));
  return true;
end;
$$;

revoke execute on function public.fn_withdraw_account_deletion() from public, anon;
grant execute on function public.fn_withdraw_account_deletion() to authenticated;

-- -----------------------------------------------------------------------------
-- 3b. Admin: decline, complete
-- -----------------------------------------------------------------------------
create or replace function public.fn_admin_decline_account_deletion(p_request_id uuid, p_note text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_note is null or length(v_note) < 3 then
    raise exception 'Tell the customer why' using errcode = '22023';
  end if;
  if length(v_note) > 300 then
    raise exception 'Keep the note under 300 characters' using errcode = '22023';
  end if;

  update public.account_deletion_requests
     set status = 'declined', resolved_at = now(), resolved_by_id = v_uid, admin_note = v_note
   where id = p_request_id and status = 'pending'
  returning user_id into v_user;
  if v_user is null then
    raise exception 'This request is no longer open' using errcode = 'P0002';
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (v_uid, 'user.deletion_declined', 'profiles', v_user,
          jsonb_build_object('request_id', p_request_id, 'note', v_note));
  return true;
end;
$$;

revoke execute on function public.fn_admin_decline_account_deletion(uuid, text) from public, anon;
grant execute on function public.fn_admin_decline_account_deletion(uuid, text) to authenticated;

create or replace function public.fn_admin_complete_account_deletion(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_req     public.account_deletion_requests%rowtype;
  v_profile public.profiles%rowtype;
  v_email   text;
  v_open    integer;
  v_orders  uuid[];
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_req from public.account_deletion_requests where id = p_request_id for update;
  if not found or v_req.status <> 'pending' then
    raise exception 'This request is no longer open' using errcode = 'P0002';
  end if;
  if v_req.user_id = v_uid then
    raise exception 'You cannot delete your own account' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_req.user_id for update;
  if v_profile.role <> 'customer' then
    raise exception 'Only customer accounts can be deleted here' using errcode = '42501';
  end if;

  v_open := public.fn_customer_open_order_count(v_req.user_id);
  if v_open > 0 then
    raise exception 'Wait until their % open order(s) are delivered or cancelled', v_open using errcode = 'P0001';
  end if;

  select email into v_email from auth.users where id = v_req.user_id;
  select coalesce(array_agg(id), '{}') into v_orders from public.orders where customer_id = v_req.user_id;

  -- Sign-in: nothing left to sign in with, and banned in case anything is.
  -- Token columns are set to '' (not null) and the ban is a real date, not
  -- 'infinity': Supabase Auth can't load a user row otherwise, which breaks
  -- its admin API (get, list, delete) for that user.
  update auth.users
     set email = null, phone = null, encrypted_password = null,
         raw_user_meta_data = '{}'::jsonb,
         email_change = '', phone_change = '', email_change_token_new = '',
         email_change_token_current = '', phone_change_token = '',
         confirmation_token = '', recovery_token = '', reauthentication_token = '',
         banned_until = now() + interval '100 years', deleted_at = now()
   where id = v_req.user_id;
  delete from auth.identities    where user_id = v_req.user_id;
  delete from auth.sessions      where user_id = v_req.user_id;
  delete from auth.refresh_tokens where user_id = v_req.user_id::text;
  delete from auth.mfa_factors   where user_id = v_req.user_id;
  delete from auth.one_time_tokens where user_id = v_req.user_id;

  -- The profile stays (orders point at it) without the person.
  perform set_config('multife.account_deletion', 'on', true);
  update public.profiles
     set full_name = 'Deleted customer', email = null, phone = null, delivery_address = null,
         whatsapp_opt_in = false, is_provisional = false, status = 'suspended', deleted_at = now()
   where id = v_req.user_id;
  perform set_config('multife.account_deletion', 'off', true);

  -- Unfinished drafts (and their lapsed holds); ordered drafts stay with
  -- their order's reservation history.
  delete from public.order_drafts where customer_id = v_req.user_id and step <> 'ordered';
  delete from public.measurement_profiles where customer_id = v_req.user_id;
  delete from public.measurement_visits   where customer_id = v_req.user_id;
  delete from public.agent_customers      where customer_id = v_req.user_id;

  -- Orders keep the garment; the delivery contact goes.
  update public.orders
     set delivery_address = jsonb_build_object('method', coalesce(delivery_address ->> 'method', 'delivery'))
   where id = any (v_orders) and delivery_address is not null;

  delete from public.notification_outbox
   where order_id = any (v_orders)
      or (v_email is not null and lower(recipient) = lower(v_email));

  update public.account_deletion_requests
     set status = 'completed', resolved_at = now(), resolved_by_id = v_uid
   where id = p_request_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (v_uid, 'user.deleted', 'profiles', v_req.user_id,
          jsonb_build_object('request_id', p_request_id, 'orders_kept', cardinality(v_orders)));

  return jsonb_build_object('orders_kept', cardinality(v_orders));
end;
$$;

revoke execute on function public.fn_admin_complete_account_deletion(uuid) from public, anon;
grant execute on function public.fn_admin_complete_account_deletion(uuid) to authenticated;

-- Open-order counts for the admin's deletion list (admin only).
create or replace function public.fn_admin_open_order_counts(p_user_ids uuid[])
returns table (user_id uuid, open_orders integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if cardinality(p_user_ids) > 200 then
    raise exception 'Too many users' using errcode = '22023';
  end if;
  return query
    select u.id, public.fn_customer_open_order_count(u.id)
      from unnest(p_user_ids) as u(id);
end;
$$;

revoke execute on function public.fn_admin_open_order_counts(uuid[]) from public, anon;
grant execute on function public.fn_admin_open_order_counts(uuid[]) to authenticated;
