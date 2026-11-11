-- Store banner image shown on the brand card and at the top of the brand's
-- storefront, alongside the existing logo_url. Same trust level as logo_url:
-- set by admins / the seed, public read through the existing suppliers RLS.
alter table public.suppliers
  add column banner_url text;
