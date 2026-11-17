-- Open jobs never end up with nobody (follows 20261117500000). Teammate to review.
--
-- With automatic assignment, a job can belong to a staff account that is
-- later deleted (production_jobs.assigned_to_id is "on delete set null") or
-- suspended, leaving the order stuck with no one. Now, when a tailor/QC
-- account is deleted or suspended, each of their open jobs moves to the least
-- busy other active member of the same kind (QC-stage jobs to a QC, the rest
-- to a tailor). If there is nobody else, the job stays unassigned and shows
-- in the admin's Needs attention, as before.

-- fn_least_busy_staff gains "everyone except this person".
drop function if exists public.fn_least_busy_staff(public.app_role);
create or replace function public.fn_least_busy_staff(p_role public.app_role, p_exclude uuid default null)
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
    and p.id is distinct from p_exclude
  order by coalesce(load.open_jobs, 0), load.last_job_at nulls first, p.created_at
  limit 1;
$$;
revoke execute on function public.fn_least_busy_staff(public.app_role, uuid) from public, anon, authenticated;

-- Move one person's open jobs to others; one at a time so the load spreads.
create or replace function public.fn_hand_back_jobs(p_staff_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       record;
  v_next  uuid;
  v_moved integer := 0;
begin
  for r in
    select j.id, j.stage
    from public.production_jobs j
    join public.orders o on o.id = j.order_id
    where j.assigned_to_id = p_staff_id
      and j.stage not in ('passed', 'failed')
      and o.status not in ('cancelled', 'failed', 'delivered')
    order by j.priority desc, j.created_at
  loop
    v_next := public.fn_least_busy_staff(case when r.stage = 'qc' then 'qc' else 'tailor' end::public.app_role, p_staff_id);
    update public.production_jobs set assigned_to_id = v_next where id = r.id;
    v_moved := v_moved + 1;
  end loop;
  return v_moved;
end;
$$;
revoke execute on function public.fn_hand_back_jobs(uuid) from public, anon, authenticated;

create or replace function public.trg_profiles_hand_back_jobs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.role in ('tailor', 'qc') then
      perform public.fn_hand_back_jobs(old.id);
    end if;
    return old;
  end if;
  if new.status = 'suspended' and old.status is distinct from 'suspended' and old.role in ('tailor', 'qc') then
    perform public.fn_hand_back_jobs(new.id);
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_profiles_hand_back_jobs() from public, anon, authenticated;

drop trigger if exists profiles_hand_back_jobs_on_delete on public.profiles;
create trigger profiles_hand_back_jobs_on_delete
  before delete on public.profiles
  for each row execute function public.trg_profiles_hand_back_jobs();

drop trigger if exists profiles_hand_back_jobs_on_suspend on public.profiles;
create trigger profiles_hand_back_jobs_on_suspend
  after update of status on public.profiles
  for each row execute function public.trg_profiles_hand_back_jobs();

-- Jobs already left with nobody (e.g. their assignee was deleted).
do $$
declare
  r record;
  v_next uuid;
begin
  for r in
    select j.id, j.stage from public.production_jobs j
    join public.orders o on o.id = j.order_id
    where j.assigned_to_id is null
      and j.stage not in ('passed', 'failed')
      and o.status not in ('cancelled', 'failed', 'delivered', 'ready_to_ship', 'dispatched')
    order by j.priority desc, j.created_at
  loop
    v_next := case when r.stage = 'qc' then public.fn_next_qc_for_job(r.id)
                   else coalesce(public.fn_maker_of_job(r.id), public.fn_least_busy_staff('tailor')) end;
    if v_next is not null then
      update public.production_jobs set assigned_to_id = v_next where id = r.id;
    end if;
  end loop;
end;
$$;
