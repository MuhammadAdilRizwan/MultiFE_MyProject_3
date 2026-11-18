-- Security review fixes: fabric reservations and order_drafts writes were
-- callable / writable by more than their owner.
--
-- 1. fn_take_hard_reservation was granted to every signed-in user with no
--    ownership check, and hard holds never expire, so anyone could lock a
--    fabric's stock for good. It is only ever called from inside the
--    SECURITY DEFINER order functions (fn_place_cod_order and the agent
--    variant), which don't need the grant, so it is revoked outright.
-- 2. fn_take_soft_reservation now requires the caller to be the draft's
--    customer or the agent who owns it, rejects a non-positive or absurd
--    quantity, and ignores the caller's p_expires_in (a client could pass
--    '100 years'). The parameter stays so existing callers keep working.
-- 3. order_drafts: the single "own" policy let an agent write a draft for any
--    customer and a customer name any agent. Split into a customer policy
--    (no agent on the draft) and an agent policy (assigned customers only).

-- 1. -------------------------------------------------------------------------
revoke execute on function public.fn_take_hard_reservation(uuid, uuid, numeric)
  from public, anon, authenticated;

-- 2. -------------------------------------------------------------------------
create or replace function public.fn_take_soft_reservation(
  p_draft_id uuid,
  p_fabric_id uuid,
  p_metres numeric,
  p_expires_in interval default '20 minutes'  -- ignored: kept for call compatibility
)
returns public.fabric_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_fabric    public.fabrics;
  v_reserved  numeric;
  v_res       public.fabric_reservations;
begin
  if v_uid is null or not exists (
    select 1 from public.order_drafts d
     where d.id = p_draft_id
       and d.fabric_id = p_fabric_id
       and (d.customer_id = v_uid or d.agent_id = v_uid)
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- No single garment needs more than this; stops one caller sweeping up stock.
  if p_metres is null or p_metres <= 0 or p_metres > 30 then
    raise exception 'Invalid quantity' using errcode = '22023';
  end if;

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
  values (p_fabric_id, p_draft_id, p_metres, 'soft', 'active', now() + interval '20 minutes')
  returning * into v_res;

  return v_res;
end;
$$;

-- 3. -------------------------------------------------------------------------
drop policy "order_drafts: own" on public.order_drafts;

create policy "order_drafts: customer manages own" on public.order_drafts
  for all to authenticated
  using (customer_id = (select auth.uid()) and agent_id is null)
  with check (customer_id = (select auth.uid()) and agent_id is null);

create policy "order_drafts: agent manages for assigned customers" on public.order_drafts
  for all to authenticated
  using (agent_id = (select auth.uid()) and public.is_assigned_agent_for(customer_id))
  with check (agent_id = (select auth.uid()) and public.is_assigned_agent_for(customer_id));
