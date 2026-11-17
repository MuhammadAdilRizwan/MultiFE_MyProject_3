-- Automatic job flow (no admin assigning). Teammate to review.
--
-- Client decision (2026-11-17): an order goes straight to a tailor, then to
-- QC, then to dispatch, without the admin assigning each step.
--   1. When an order is placed (its production job is inserted), the fabric
--      is marked secured straight away (its stock is already held by the hard
--      reservation) and the job goes to the least busy active tailor.
--   2. When a tailor sends the job to quality check it goes to a QC: the one
--      who already checked this job, if still active, else the least busy.
--   3. When QC sends it back to stitching it returns to the tailor who made it.
--   4. QC pass -> ready_to_ship: dispatch already sees every such order.
--   5. Remakes: the assignee is optional; default is the original tailor,
--      else the least busy.
-- "Least busy" = fewest open jobs; ties go to whoever has gone longest
-- without a new job. If nobody suitable is active, the job is left as it
-- is and the admin sees it in Needs attention; the admin can still reassign
-- any job by hand. Existing open orders are brought into line once, below.

-- Open jobs per active staff member of a role, least busy first.
create or replace function public.fn_least_busy_staff(p_role public.app_role)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  left join lateral (
    select count(*) filter (where j.stage not in ('passed', 'failed')
                              and o.status not in ('cancelled', 'failed', 'delivered')) as open_jobs,
           max(j.updated_at) as last_job_at
    from public.production_jobs j
    join public.orders o on o.id = j.order_id
    where j.assigned_to_id = p.id
  ) load on true
  where p.role = p_role and p.status = 'active'
  order by coalesce(load.open_jobs, 0), load.last_job_at nulls first, p.created_at
  limit 1;
$$;

-- The tailor/QC who last sent this job to quality check, if still active.
create or replace function public.fn_maker_of_job(p_job_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.actor_id
  from public.production_events e
  join public.profiles p on p.id = e.actor_id
  where e.job_id = p_job_id and e.to_stage = 'qc'
    and p.role in ('tailor', 'qc') and p.status = 'active'
  order by e.created_at desc
  limit 1;
$$;

-- The QC who already checked this job (sent it back), if still active; else
-- the least busy QC.
create or replace function public.fn_next_qc_for_job(p_job_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select e.actor_id
       from public.production_events e
       join public.profiles p on p.id = e.actor_id
      where e.job_id = p_job_id and e.from_stage = 'qc'
        and p.role = 'qc' and p.status = 'active'
      order by e.created_at desc
      limit 1),
    public.fn_least_busy_staff('qc'));
$$;

revoke execute on function public.fn_least_busy_staff(public.app_role) from public, anon, authenticated;
revoke execute on function public.fn_maker_of_job(uuid)                 from public, anon, authenticated;
revoke execute on function public.fn_next_qc_for_job(uuid)              from public, anon, authenticated;

-- 1. New order: secure the fabric and give the job to a tailor. ---------------
-- Orders are created by service-role functions (fn_place_cod_order,
-- fn_create_order_from_draft), which fn_transition_order lets confirm the
-- fabric. If that ever fails, the order simply stays "placed" for the admin's
-- "Mark fabric secured" button; placing the order never fails because of it.
create or replace function public.trg_production_job_auto_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tailor uuid;
begin
  if new.assigned_to_id is null and new.stage = 'pending' then
    v_tailor := public.fn_least_busy_staff('tailor');
    if v_tailor is not null then
      update public.production_jobs set assigned_to_id = v_tailor where id = new.id;
    end if;
  end if;

  if exists (select 1 from public.orders where id = new.order_id and status = 'placed') then
    begin
      perform public.fn_transition_order(new.order_id, 'fabric_secured', 'admin',
                                         'Automatic: fabric held when the order was placed');
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$$;

revoke execute on function public.trg_production_job_auto_start() from public, anon, authenticated;

drop trigger if exists production_job_auto_start on public.production_jobs;
create trigger production_job_auto_start
  after insert on public.production_jobs
  for each row execute function public.trg_production_job_auto_start();

-- fn_advance_production_stage: as in 20261117100000 + automatic hand-offs.
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
  v_next   uuid;
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

  -- Automatic hand-offs (no admin step): a tailor's finished job goes to QC;
  -- a job QC sends back goes to the tailor who made it. If nobody suitable is
  -- active, it stays with the current person and the admin can reassign.
  if p_to_stage = 'qc' and v_role <> 'qc' then
    v_next := public.fn_next_qc_for_job(p_job_id);
  elsif v_from = 'qc' and p_to_stage = 'stitching' then
    v_next := public.fn_maker_of_job(p_job_id);
  end if;
  if v_next is not null and v_next is distinct from v_uid then
    update public.production_jobs set assigned_to_id = v_next where id = p_job_id returning * into v_job;
  end if;

  return v_job;
end;
$$;

-- fn_create_remake: as in 20261117100000; the assignee is now optional.
create or replace function public.fn_create_remake(
  p_job_id       uuid,
  p_metres_lost  numeric,
  p_assign_to    uuid default null
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
  v_assign uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can order a remake' using errcode = '42501';
  end if;
  if p_metres_lost is null or p_metres_lost < 0 or p_metres_lost > 100 then
    raise exception 'Enter the fabric lost in metres (0 to 100)' using errcode = '22023';
  end if;
  if p_assign_to is not null and not exists (select 1 from public.profiles
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

  -- No one chosen: the tailor who made it, if still active, else the least busy.
  v_assign := coalesce(p_assign_to, public.fn_maker_of_job(v_job.id), public.fn_least_busy_staff('tailor'));

  insert into public.production_jobs (order_id, assigned_to_id, stage, priority)
  values (v_job.order_id, v_assign, 'approved', greatest(v_job.priority, 0) + 1)
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

-- 6. Bring existing open orders into line, once. ------------------------------
-- Runs as the service role (as order placement does), so the fabric step goes
-- through fn_transition_order like any other status change.
do $$
declare
  r record;
  v_staff uuid;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  for r in
    select o.id from public.orders o
    where o.status = 'placed'
      and exists (select 1 from public.production_jobs j where j.order_id = o.id)
  loop
    begin
      perform public.fn_transition_order(r.id, 'fabric_secured', 'admin',
                                         'Automatic: fabric held when the order was placed');
    exception when others then
      null;
    end;
  end loop;

  -- Unassigned open jobs, oldest first, one at a time so the load spreads.
  for r in
    select j.id, j.stage from public.production_jobs j
    join public.orders o on o.id = j.order_id
    where j.assigned_to_id is null
      and j.stage not in ('passed', 'failed')
      and o.status not in ('cancelled', 'failed', 'delivered', 'ready_to_ship', 'dispatched')
    order by j.created_at
  loop
    v_staff := case when r.stage = 'qc' then public.fn_next_qc_for_job(r.id)
                    else coalesce(public.fn_maker_of_job(r.id), public.fn_least_busy_staff('tailor')) end;
    if v_staff is not null then
      update public.production_jobs set assigned_to_id = v_staff where id = r.id;
    end if;
  end loop;

  perform set_config('request.jwt.claims', '', true);
end;
$$;
