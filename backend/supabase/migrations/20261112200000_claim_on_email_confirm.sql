-- FR-AUTH-10 by email: an agent creates the customer's account with their
-- email and an invite is sent. When the customer accepts it (Supabase sets
-- email_confirmed_at), the account is theirs — clear is_provisional and log
-- the claim, exactly as handle_phone_confirmed does for the phone route.
create or replace function public.handle_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.profiles set is_provisional = false
     where id = new.id and is_provisional;
    if found then
      insert into public.audit_log (actor_id, action, entity, entity_id, after)
      values (new.id, 'profile.claim', 'profiles', new.id,
              jsonb_build_object('claimed_at', new.email_confirmed_at, 'via', 'email'));
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_email_confirmed() from public, anon, authenticated;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_email_confirmed();
