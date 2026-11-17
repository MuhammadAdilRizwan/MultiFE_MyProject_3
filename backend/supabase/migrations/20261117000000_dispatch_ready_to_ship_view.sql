-- production_order_view's own comment says it's for "tailor, QC, dispatch,"
-- but its WHERE clause only ever matched a production job assigned to the
-- caller — dispatch is never assigned to a production job, so in practice
-- they got nothing from it and had no way to discover which orders are
-- ready_to_ship (nothing creates a shipments row until fn_dispatch_order is
-- first called, which needs the order id). Adding the ready_to_ship/
-- is_dispatch() branch makes the view's existing comment true. Same column
-- list as before, so the existing grant still applies.
create or replace view public.production_order_view as
select o.id, o.number, o.status, o.order_channel, o.template_id, o.fabric_id, o.supplier_id,
       o.measurement_profile_id, o.measurements_confirmed_by_id, o.measurements_confirmed_at,
       o.production_approved_by_id, o.production_approved_at, o.yardage_metres,
       o.est_delivery_date, o.created_at, o.updated_at
from public.orders o
where exists (select 1 from public.production_jobs j where j.order_id = o.id and j.assigned_to_id = (select auth.uid()))
   or (o.status = 'ready_to_ship' and public.is_dispatch())
   or (select public.is_admin());
