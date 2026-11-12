-- FR-CUS-16: a customer keeps their own delivery address in their profile,
-- edited from the account page and used to prefill checkout. Same shape as
-- orders.delivery_address without the name and phone, which live on the
-- profile itself: { address_line, city }.
--
-- No new policy: "profiles: update own" already lets a user update their own
-- row, and guard_admin_columns still keeps role, status and is_provisional
-- admin-only.

alter table public.profiles
  add column delivery_address jsonb
    check (delivery_address is null or jsonb_typeof(delivery_address) = 'object');

comment on column public.profiles.delivery_address is
  'Saved delivery address { address_line, city }; prefills checkout (FR-CUS-16).';
