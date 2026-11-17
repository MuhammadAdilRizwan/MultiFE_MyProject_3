-- Production panel fixes (FR-PRD-02..05, FR-AI-14/15, FR-AUTH-06), found while
-- building the /production screens on top of the production module.
-- Teammate to review.
--
-- 1. Assigned staff can see the fabric of their job. "fabrics: production
--    reads on assigned jobs" looked the order up in public.orders, which
--    production staff can't read (they use production_order_view), so the
--    policy never matched and a fabric hidden from the storefront vanished
--    from the job sheet. Now a SECURITY DEFINER helper, like
--    is_assigned_job_order.
-- 2. fn_approve_for_production
--    - only the staff member the job is assigned to (or an admin) may approve
--      (any tailor/QC could approve any job id before);
--    - the order transition uses the caller's real role. It was hard-coded
--      'tailor', so a QC user always got "Actor role does not match the caller".
-- 3. fn_advance_production_stage
--    - assignment check, as above;
--    - QC fail (qc -> stitching) moved the order to 'in_qc' (it is already
--      there, so it always failed); it now moves it back to 'in_stitching'
--      and requires a reason;
--    - only the next stage in order is accepted (pending/approved/cutting/
--      stitching/qc/passed); 'failed' (remake) stays an admin path;
--    - production_events.from_stage was read after the update, so it always
--      equalled to_stage; it now records the real previous stage;
--    - passes the caller's real role, so a tailor trying to pass QC gets
--      "Only QC can pass a job" rather than a role-mismatch error.
-- 4. fn_record_fabric_received(job): warehouse receipt of the fabric
--    (FR-PRD-02, fabric_secured -> received_at_hub) for the assigned
--    tailor/QC, checked against the job rather than a bare order id.
-- 5. Same as 1 for the customer's confirmed measurement profile.

-- 1. -------------------------------------------------------------------------
create or replace function public.is_assigned_job_fabric(p_fabric_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.production_jobs j
    join public.orders o on o.id = j.order_id
    where o.fabric_id = p_fabric_id and j.assigned_to_id = (select auth.uid())
  );
$$;

drop policy if exists "fabrics: production reads on assigned jobs" on public.fabrics;
create policy "fabrics: production reads on assigned jobs" on public.fabrics
  for select to authenticated
  using (public.is_production_role() and public.is_assigned_job_fabric(id));

-- 2. -------------------------------------------------------------------------
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

-- 3. -------------------------------------------------------------------------
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
  elsif v_from = 'pending' and p_to_stage = 'approved' then
    raise exception 'Approve the measurements first (fn_approve_for_production)' using errcode = '22023';
  else
    raise exception 'Cannot move a job from % to %', v_from, p_to_stage using errcode = '22023';
  end if;

  update public.production_jobs
     set stage = p_to_stage,
         started_at  = case when p_to_stage = 'cutting' and started_at is null then now() else started_at end,
         finished_at = case when p_to_stage = 'passed' then now() else finished_at end
   where id = p_job_id
  returning * into v_job;

  insert into public.production_events (job_id, from_stage, to_stage, actor_id, reason)
  values (p_job_id, v_from, p_to_stage, v_uid, v_reason);

  return v_job;
end;
$$;

-- 4. -------------------------------------------------------------------------
create or replace function public.fn_record_fabric_received(p_job_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_role public.app_role;
  v_job  public.production_jobs;
begin
  if not public.is_tailor_or_qc() then
    raise exception 'Only a tailor or QC can record receipt of the fabric' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = v_uid;

  select * into v_job from public.production_jobs where id = p_job_id;
  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  if v_job.assigned_to_id is distinct from v_uid then
    raise exception 'This job is not assigned to you' using errcode = '42501';
  end if;

  return public.fn_transition_order(v_job.order_id, 'received_at_hub', v_role);
end;
$$;

revoke execute on function public.fn_record_fabric_received(uuid) from public, anon;
grant  execute on function public.fn_record_fabric_received(uuid) to authenticated;

-- 5. -------------------------------------------------------------------------
-- Same problem as 1 for "measurement_profiles: production reads on assigned
-- jobs": the customer's confirmed set (kept alongside any correction,
-- FR-AI-15) was unreadable on the job.
create or replace function public.is_assigned_job_measurement_profile(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.production_jobs j
    join public.orders o on o.id = j.order_id
    where o.measurement_profile_id = p_profile_id and j.assigned_to_id = (select auth.uid())
  );
$$;

drop policy if exists "measurement_profiles: production reads on assigned jobs" on public.measurement_profiles;
create policy "measurement_profiles: production reads on assigned jobs" on public.measurement_profiles
  for select to authenticated
  using (public.is_production_role() and public.is_assigned_job_measurement_profile(id));
