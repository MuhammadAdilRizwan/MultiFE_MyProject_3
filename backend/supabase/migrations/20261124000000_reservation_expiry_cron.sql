-- reservation-expiry background job (SDS v2 §11.3, FR-FAB-08/09).
--
-- A soft hold lasts 20 minutes (fn_take_soft_reservation). Availability already
-- ignores a lapsed soft hold (fn_fabric_reserved_metres), but nothing ever
-- closed the row, so it stayed 'active' for good. This schedules the existing
-- sweep, fn_release_expired_soft_reservations(), to run every minute inside
-- the database, so each soft hold is marked 'expired' within a minute of its
-- 20 minutes running out. It runs as SQL directly — no Edge Function or pg_net
-- needed for a single UPDATE.
--
-- cron.schedule upserts by job name, so re-running this is safe.

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'reservation-expiry',
  '* * * * *',
  $$select public.fn_release_expired_soft_reservations()$$
);
