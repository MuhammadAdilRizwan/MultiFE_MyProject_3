-- Fabric stock that reflects orders (FR-FAB-08/09, SDS v2 §6.3).
--
-- Stock is never decremented when an order is placed: the order holds a hard
-- fabric_reservations row, and fabrics.stock_metres (what's physically on the
-- roll) only drops at cutting (fn_transition_order). What a customer can still
-- order is therefore
--     available = stock_metres − active reservations.
-- The screens showed stock_metres, so an order never seemed to change it.
--
-- This migration:
--   1. fn_fabric_reserved_metres: one definition of "held" — hard holds, plus
--      soft holds that haven't expired. The expiry job (reservation-expiry) is
--      not built yet, so lapsed 20-minute soft holds were still counted and
--      would block stock forever.
--   2. fn_take_soft_reservation / fn_take_hard_reservation use it (bodies
--      otherwise unchanged).
--   3. At cutting the fabric is used up: stock_metres drops (existing) and the
--      order's hard hold is closed ('converted') so it isn't counted twice.
--   4. fn_fabric_stock(ids): stock / reserved / available for the fabrics the
--      caller may see, for the storefront and admin screens.
-- Teammate to review.

-- 1. -------------------------------------------------------------------------
create or replace function public.fn_fabric_reserved_metres(
  p_fabric_id uuid,
  p_except_draft_soft uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(r.metres), 0)
  from public.fabric_reservations r
  where r.fabric_id = p_fabric_id
    and r.status = 'active'
    and (r.kind = 'hard' or r.expires_at is null or r.expires_at > now())
    and not (r.kind = 'soft' and p_except_draft_soft is not null and r.order_draft_id = p_except_draft_soft);
$$;

revoke execute on function public.fn_fabric_reserved_metres(uuid, uuid) from public, anon, authenticated;

-- 2. -------------------------------------------------------------------------
create or replace function public.fn_take_soft_reservation(
  p_draft_id uuid,
  p_fabric_id uuid,
  p_metres numeric,
  p_expires_in interval default '20 minutes'
)
returns public.fabric_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fabric    public.fabrics;
  v_reserved  numeric;
  v_res       public.fabric_reservations;
begin
  select * into v_fabric from public.fabrics where id = p_fabric_id for update;
  if not found or not v_fabric.is_available then
    raise exception 'Fabric is not available' using errcode = '22023';
  end if;

  -- This draft's own earlier soft hold is replaced below, so it doesn't count.
  v_reserved := public.fn_fabric_reserved_metres(p_fabric_id, p_draft_id);

  if v_fabric.stock_metres - v_reserved < p_metres then
    raise exception 'Not enough fabric in stock' using errcode = '22023';
  end if;

  delete from public.fabric_reservations
   where order_draft_id = p_draft_id and kind = 'soft' and status = 'active';

  insert into public.fabric_reservations (fabric_id, order_draft_id, metres, kind, status, expires_at)
  values (p_fabric_id, p_draft_id, p_metres, 'soft', 'active', now() + p_expires_in)
  returning * into v_res;

  return v_res;
end;
$$;

create or replace function public.fn_take_hard_reservation(
  p_draft_id uuid,
  p_fabric_id uuid,
  p_metres numeric
)
returns public.fabric_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fabric   public.fabrics;
  v_reserved numeric;
  v_res      public.fabric_reservations;
begin
  select * into v_fabric from public.fabrics where id = p_fabric_id for update;
  if not found or not v_fabric.is_available then
    raise exception 'Fabric is not available' using errcode = '22023';
  end if;

  -- this draft's own soft hold doesn't double-count
  v_reserved := public.fn_fabric_reserved_metres(p_fabric_id, p_draft_id);

  if v_fabric.stock_metres - v_reserved < p_metres then
    raise exception 'Not enough fabric in stock to confirm this order' using errcode = '22023';
  end if;

  update public.fabric_reservations set status = 'converted'
   where order_draft_id = p_draft_id and kind = 'soft' and status = 'active';

  insert into public.fabric_reservations (fabric_id, order_draft_id, metres, kind, status)
  values (p_fabric_id, p_draft_id, p_metres, 'hard', 'active')
  returning * into v_res;

  return v_res;
end;
$$;

-- 3. -------------------------------------------------------------------------
-- fn_transition_order takes the yardage off stock_metres on entering cutting;
-- this closes the order's hold in the same transaction.
create or replace function public.trg_orders_close_hold_on_cutting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fabric_reservations
     set status = 'converted'
   where order_id = new.id and kind = 'hard' and status = 'active';
  return null;
end;
$$;

revoke execute on function public.trg_orders_close_hold_on_cutting() from public, anon, authenticated;

drop trigger if exists orders_close_hold_on_cutting on public.orders;
create trigger orders_close_hold_on_cutting
  after update of status on public.orders
  for each row
  when (new.status = 'in_cutting' and old.status is distinct from 'in_cutting')
  execute function public.trg_orders_close_hold_on_cutting();

-- Orders already past cutting: their fabric is off stock_metres already.
update public.fabric_reservations r
   set status = 'converted'
  from public.orders o
 where r.order_id = o.id and r.kind = 'hard' and r.status = 'active'
   and o.status in ('in_cutting', 'in_stitching', 'in_qc', 'ready_to_ship', 'dispatched', 'delivered');

-- 4. -------------------------------------------------------------------------
-- Only fabrics the caller could read anyway (same rules as the fabrics
-- policies: public = available, not hidden, active supplier; admin all;
-- supplier contact their own). Totals only — no order or customer data.
create or replace function public.fn_fabric_stock(p_fabric_ids uuid[])
returns table (fabric_id uuid, stock_metres numeric, reserved_metres numeric, available_metres numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         f.stock_metres,
         h.reserved,
         greatest(f.stock_metres - h.reserved, 0)
  from public.fabrics f
  cross join lateral (select public.fn_fabric_reserved_metres(f.id) as reserved) h
  where f.id = any (p_fabric_ids[1:500])
    and (
      (select public.is_admin())
      or public.is_supplier_contact_for(f.supplier_id)
      or (f.is_available and not f.is_hidden
          and exists (select 1 from public.suppliers s where s.id = f.supplier_id and s.status = 'active'))
    );
$$;

revoke execute on function public.fn_fabric_stock(uuid[]) from public;
grant  execute on function public.fn_fabric_stock(uuid[]) to anon, authenticated;
