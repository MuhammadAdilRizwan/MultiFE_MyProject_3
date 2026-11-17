-- Production staff's finished work (FR-PRD-04/05). Teammate to review.
--
-- A job is visible to staff only while it's assigned to them ("production_jobs:
-- assigned staff"). When the admin hands a stitched job to QC, the tailor's
-- work disappears from their own "Done" list. This returns the jobs the caller
-- recorded a step on (production_events.actor_id) but no longer holds, with a
-- summary only: order number, outfit, fabric, where it is now and the
-- caller's last step. No measurements, customer, price or payment detail.

create or replace function public.fn_my_production_history()
returns table (
  job_id          uuid,
  order_number    text,
  template_name   text,
  fabric_name     text,
  fabric_image    text,
  stage           public.production_stage,
  order_status    public.order_status,
  due_date        date,
  my_last_step    public.production_stage,
  my_last_step_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id,
         o.number,
         (select oi.template_name from public.order_items oi where oi.order_id = o.id limit 1),
         coalesce(nullif(f.display_name, ''), f.name),
         (select fi.url from public.fabric_images fi where fi.fabric_id = f.id order by fi.sort limit 1),
         j.stage,
         o.status,
         o.est_delivery_date,
         mine.to_stage,
         mine.created_at
  from public.production_jobs j
  join public.orders o on o.id = j.order_id
  left join public.fabrics f on f.id = o.fabric_id
  join lateral (
    select e.to_stage, e.created_at
    from public.production_events e
    where e.job_id = j.id and e.actor_id = (select auth.uid())
    order by e.created_at desc
    limit 1
  ) mine on true
  where public.is_production_role()
    and j.assigned_to_id is distinct from (select auth.uid())
  order by mine.created_at desc
  limit 100;
$$;

revoke execute on function public.fn_my_production_history() from public, anon;
grant  execute on function public.fn_my_production_history() to authenticated;
