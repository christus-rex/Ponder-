begin;

-- `profile_is_discoverable(uuid)` is used as an internal helper by trusted
-- SECURITY DEFINER RPCs, but it does not need to be a directly callable
-- authenticated RPC. Keep the authoritative visibility decision row-local for
-- profile RLS while retaining the helper only for trusted server-owned flows.
alter table public.profiles
  add column if not exists is_discoverable boolean not null default false;

comment on column public.profiles.is_discoverable is
  'Server-derived visibility state. Maintained from onboarding completion and authoritative account status; client writes are ignored by trigger.';

create or replace function public.sync_profile_discoverability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.is_discoverable :=
    new.onboarding_completed_at is not null
    and exists (
      select 1
      from public.user_access ua
      where ua.id = new.id
        and ua.account_status = 'active'::public.account_status
    );
  return new;
end;
$$;

create or replace function public.sync_profile_discoverability_from_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
  set is_discoverable = (
    p.onboarding_completed_at is not null
    and new.account_status = 'active'::public.account_status
  )
  where p.id = new.id;
  return null;
end;
$$;

revoke execute on function public.sync_profile_discoverability()
  from public, anon, authenticated;
revoke execute on function public.sync_profile_discoverability_from_access()
  from public, anon, authenticated;

drop trigger if exists profiles_sync_discoverability on public.profiles;
create trigger profiles_sync_discoverability
before insert or update on public.profiles
for each row execute procedure public.sync_profile_discoverability();

drop trigger if exists user_access_sync_profile_discoverability on public.user_access;
create trigger user_access_sync_profile_discoverability
after insert or update of account_status on public.user_access
for each row execute procedure public.sync_profile_discoverability_from_access();

-- Backfill from authoritative state before the RLS policy switches to the
-- derived column.
update public.profiles p
set is_discoverable = (
  p.onboarding_completed_at is not null
  and exists (
    select 1
    from public.user_access ua
    where ua.id = p.id
      and ua.account_status = 'active'::public.account_status
  )
);

drop policy if exists "active profiles are discoverable" on public.profiles;
create policy "active profiles are discoverable"
on public.profiles for select to authenticated
using (
  (select public.current_user_is_active())
  and (
    id = (select auth.uid())
    or is_discoverable
  )
);

-- Trusted SECURITY DEFINER functions continue to execute this helper as their
-- owner. Browser-authenticated callers no longer receive direct EXECUTE
-- permission, preventing arbitrary discoverability probes through PostgREST RPC.
revoke execute on function public.profile_is_discoverable(uuid)
  from public, anon, authenticated;

commit;
