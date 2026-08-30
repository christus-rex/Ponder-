begin;

create type public.app_role as enum (
  'member',
  'creator',
  'moderator',
  'admin'
);

create type public.account_status as enum (
  'active',
  'suspended',
  'banned'
);

create table public.user_access (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'member',
  account_status public.account_status not null default 'active',
  restriction_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_access_updated_at
before update on public.user_access
for each row execute procedure public.set_updated_at();

alter table public.user_access enable row level security;

grant select on public.user_access to authenticated;

create policy "users read own access state"
on public.user_access for select to authenticated
using (id = (select auth.uid()));

insert into public.user_access (id)
select id from auth.users
on conflict (id) do nothing;

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_access ua
    where ua.id = auth.uid()
      and ua.account_status = 'active'
  );
$$;

create or replace function public.current_user_can_enter()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_access ua
    join public.user_private up on up.id = ua.id
    join public.profiles p on p.id = ua.id
    join public.user_preferences pref on pref.id = ua.id
    where ua.id = auth.uid()
      and ua.account_status = 'active'
      and up.date_of_birth <= (current_date - interval '18 years')::date
      and up.terms_accepted_at is not null
      and p.onboarding_completed_at is not null
  );
$$;

create or replace function public.current_user_has_role(required_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_access ua
    where ua.id = auth.uid()
      and ua.account_status = 'active'
      and ua.role = any(required_roles)
  );
$$;

create or replace function public.current_access_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'user_id', ua.id,
        'role', ua.role,
        'account_status', ua.account_status,
        'restriction_reason', ua.restriction_reason,
        'age_status', up.age_status,
        'terms_accepted', (up.terms_accepted_at is not null),
        'onboarding_completed', (p.onboarding_completed_at is not null),
        'can_enter', (
          ua.account_status = 'active'
          and up.date_of_birth <= (current_date - interval '18 years')::date
          and up.terms_accepted_at is not null
          and p.onboarding_completed_at is not null
          and pref.id is not null
        )
      )
      from public.user_access ua
      join public.user_private up on up.id = ua.id
      join public.profiles p on p.id = ua.id
      left join public.user_preferences pref on pref.id = ua.id
      where ua.id = auth.uid()
    ),
    jsonb_build_object(
      'user_id', auth.uid(),
      'role', null,
      'account_status', 'missing',
      'restriction_reason', 'access_state_missing',
      'age_status', null,
      'terms_accepted', false,
      'onboarding_completed', false,
      'can_enter', false
    )
  );
$$;

revoke execute on function public.current_user_is_active() from public, anon;
revoke execute on function public.current_user_can_enter() from public, anon;
revoke execute on function public.current_user_has_role(public.app_role[]) from public, anon;
revoke execute on function public.current_access_context() from public, anon;

grant execute on function public.current_user_is_active() to authenticated;
grant execute on function public.current_user_can_enter() to authenticated;
grant execute on function public.current_user_has_role(public.app_role[]) to authenticated;
grant execute on function public.current_access_context() to authenticated;

drop policy if exists "authenticated profiles are discoverable" on public.profiles;
create policy "active profiles are discoverable"
on public.profiles for select to authenticated
using (
  (select public.current_user_is_active())
  and (onboarding_completed_at is not null or id = (select auth.uid()))
);

drop policy if exists "users update own profile" on public.profiles;
create policy "active users update own profile"
on public.profiles for update to authenticated
using (
  (select public.current_user_is_active())
  and id = (select auth.uid())
)
with check (
  (select public.current_user_is_active())
  and id = (select auth.uid())
);

create policy "full app access required"
on public.rooms
as restrictive
for all
to authenticated
using ((select public.current_user_can_enter()))
with check ((select public.current_user_can_enter()));

create policy "full app access required"
on public.room_members
as restrictive
for all
to authenticated
using ((select public.current_user_can_enter()))
with check ((select public.current_user_can_enter()));

create policy "full app access required"
on public.messages
as restrictive
for all
to authenticated
using ((select public.current_user_can_enter()))
with check ((select public.current_user_can_enter()));

create policy "full app access required"
on public.connections
as restrictive
for all
to authenticated
using ((select public.current_user_can_enter()))
with check ((select public.current_user_can_enter()));

create policy "full app access required"
on public.wallet_links
as restrictive
for all
to authenticated
using ((select public.current_user_can_enter()))
with check ((select public.current_user_can_enter()));

create policy "full app access required"
on public.ledger_accounts
as restrictive
for all
to authenticated
using ((select public.current_user_can_enter()))
with check ((select public.current_user_can_enter()));

create policy "full app access required"
on public.ledger_entries
as restrictive
for all
to authenticated
using ((select public.current_user_can_enter()))
with check ((select public.current_user_can_enter()));

create policy "full app access required"
on public.ledger_postings
as restrictive
for all
to authenticated
using ((select public.current_user_can_enter()))
with check ((select public.current_user_can_enter()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dob date;
begin
  dob := nullif(new.raw_user_meta_data->>'date_of_birth', '')::date;

  if dob is null or dob > (current_date - interval '18 years')::date then
    raise exception 'Ponder+ requires an adult date of birth';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data->>'display_name', ''));

  insert into public.user_private (id, date_of_birth, age_status)
  values (new.id, dob, 'self_attested');

  insert into public.user_preferences (id)
  values (new.id);

  insert into public.user_access (id, role, account_status)
  values (new.id, 'member', 'active');

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

commit;
