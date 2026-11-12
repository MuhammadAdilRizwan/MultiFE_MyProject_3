-- Admin: suspend / reactivate accounts (FR-ADM-05, FR-AUTH-08) and the
-- dashboard numbers (FR-ADM-08).
--
-- 1. fn_admin_set_account_status: flips profiles.status and writes the audit
--    entry in one transaction. Admins can already update profiles under RLS,
--    but audit_log has no insert policy (it's written only by functions), so
--    the change and its audit go through here. Suspension itself is already
--    enforced everywhere: sign-in refuses it (users/signIn), the middleware
--    signs a suspended user out of every panel, is_admin()/current_agent_id()
--    require status = 'active', and ordering checks it.
-- 2. fn_admin_dashboard_stats: order counts and values computed in SQL, so the
--    dashboard never pulls every order row to the browser or server.

create or replace function public.fn_admin_set_account_status(
  p_user_id uuid,
  p_status  public.account_status,
  p_reason  text default null
)
returns public.account_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_from   public.account_status;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'You cannot change your own account status' using errcode = '42501';
  end if;
  if p_status = 'suspended' and v_reason is null then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if v_reason is not null and length(v_reason) > 300 then
    raise exception 'Keep the reason under 300 characters' using errcode = '22023';
  end if;

  select status into v_from from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if v_from = p_status then
    return v_from;
  end if;

  update public.profiles set status = p_status where id = p_user_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_uid,
          case when p_status = 'suspended' then 'user.suspend' else 'user.reactivate' end,
          'profiles', p_user_id,
          jsonb_build_object('status', v_from),
          jsonb_build_object('status', p_status, 'reason', v_reason));

  return p_status;
end;
$$;

revoke execute on function public.fn_admin_set_account_status(uuid, public.account_status, text) from public, anon;
grant execute on function public.fn_admin_set_account_status(uuid, public.account_status, text) to authenticated;


-- Days are Pakistan days (Asia/Karachi); "this week" starts on Monday.
create or replace function public.fn_admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_week  date := date_trunc('week', (now() at time zone 'Asia/Karachi'))::date;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  with o as (
    select status, total, payment_method, payment_status, supplier_id,
           (created_at at time zone 'Asia/Karachi')::date as day
      from public.orders
  )
  select jsonb_build_object(
    'orders_today',     (select count(*) from o where day = v_today),
    'orders_this_week', (select count(*) from o where day >= v_week),
    'orders_total',     (select count(*) from o),
    -- Cash still to collect: COD orders that are neither delivered nor closed.
    'cod_open_count',   (select count(*) from o where payment_method = 'cash_on_delivery'
                           and status not in ('delivered', 'cancelled', 'failed')),
    'cod_open_value',   (select coalesce(sum(total), 0) from o where payment_method = 'cash_on_delivery'
                           and status not in ('delivered', 'cancelled', 'failed')),
    'cod_collected_value', (select coalesce(sum(total), 0) from o where payment_method = 'cash_on_delivery'
                           and status = 'delivered'),
    'by_status', coalesce((select jsonb_object_agg(status, n) from
                   (select status::text, count(*) as n from o group by status) s), '{}'::jsonb),
    -- Top brands by orders that weren't cancelled or failed.
    'top_brands', coalesce((select jsonb_agg(jsonb_build_object('name', b.name, 'orders', b.n, 'value', b.v) order by b.n desc, b.v desc)
                   from (select s.name, count(*) as n, sum(o.total) as v
                           from o join public.suppliers s on s.id = o.supplier_id
                          where o.status not in ('cancelled', 'failed')
                          group by s.name
                          order by n desc, v desc
                          limit 5) b), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.fn_admin_dashboard_stats() from public, anon;
grant execute on function public.fn_admin_dashboard_stats() to authenticated;
