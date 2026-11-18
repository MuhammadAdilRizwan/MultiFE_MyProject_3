-- Rate limiting for sign-in, sign-up and password reset (security review #4).
-- The auth server actions call fn_rate_limit_check with a hashed key (action +
-- caller address, and action + email) before they contact Supabase Auth.
--
-- Kept in Postgres so it works on serverless hosting with no extra service.
-- Service role only: the table has RLS on and no policies, and the function
-- is not granted to anon or signed-in users.

create table public.rate_limit_hits (
  id      bigint generated always as identity primary key,
  key     text not null,
  hit_at  timestamptz not null default now()
);

create index rate_limit_hits_key_hit_at_idx on public.rate_limit_hits (key, hit_at);

alter table public.rate_limit_hits enable row level security;

-- Counts this attempt against p_key and returns true if it is allowed, false
-- if p_limit attempts already happened within p_window. Refused attempts are
-- not recorded, so a blocked caller isn't locked out for longer by retrying.
create or replace function public.fn_rate_limit_check(
  p_key    text,
  p_limit  integer,
  p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_key is null or btrim(p_key) = '' or p_limit is null or p_limit < 1 or p_window is null then
    raise exception 'Invalid rate limit' using errcode = '22023';
  end if;

  -- Serialise attempts on the same key so two parallel requests can't both
  -- squeeze under the limit.
  perform pg_advisory_xact_lock(hashtext(p_key));

  delete from public.rate_limit_hits where key = p_key and hit_at < now() - p_window;

  select count(*) into v_count from public.rate_limit_hits where key = p_key;
  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_hits (key) values (p_key);

  -- Housekeeping: the longest window in use is an hour, so a day-old row is
  -- never needed. Done on ~1% of allowed calls to keep the table small.
  if random() < 0.01 then
    delete from public.rate_limit_hits where hit_at < now() - interval '1 day';
  end if;

  return true;
end;
$$;

revoke execute on function public.fn_rate_limit_check(text, integer, interval) from public, anon, authenticated;
grant  execute on function public.fn_rate_limit_check(text, integer, interval) to service_role;
