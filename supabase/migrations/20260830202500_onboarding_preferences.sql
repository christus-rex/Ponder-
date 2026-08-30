begin;

create type public.mature_content_preference as enum (
  'standard_mature',
  'after_dark',
  'hide_mature_topics'
);

create table public.user_preferences (
  id uuid primary key references auth.users(id) on delete cascade,
  mature_content_preference public.mature_content_preference not null default 'standard_mature',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_preferences_updated_at
before update on public.user_preferences
for each row execute procedure public.set_updated_at();

alter table public.user_preferences enable row level security;

grant select, update on public.user_preferences to authenticated;

create policy "users read own preferences"
on public.user_preferences for select to authenticated
using (id = (select auth.uid()));

create policy "users update own preferences"
on public.user_preferences for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

insert into public.user_preferences (id)
select id from public.profiles
on conflict (id) do nothing;

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

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

create or replace function public.stamp_terms_acceptance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.terms_accepted_at is null and new.terms_accepted_at is not null then
    new.terms_accepted_at := now();
  elsif old.terms_accepted_at is not null and new.terms_accepted_at is distinct from old.terms_accepted_at then
    raise exception 'Terms acceptance cannot be revoked or rewritten';
  end if;

  return new;
end;
$$;

create trigger user_private_terms_acceptance
before update of terms_accepted_at on public.user_private
for each row execute procedure public.stamp_terms_acceptance();

create or replace function public.enforce_onboarding_prerequisites()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.onboarding_completed_at is not null then
    if not exists (
      select 1
      from public.user_private up
      where up.id = new.id
        and up.terms_accepted_at is not null
    ) then
      raise exception 'Terms acceptance is required before onboarding can complete';
    end if;

    if not exists (
      select 1
      from public.user_preferences pref
      where pref.id = new.id
    ) then
      raise exception 'User preferences are required before onboarding can complete';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_require_onboarding_prerequisites
before update of onboarding_completed_at on public.profiles
for each row execute procedure public.enforce_onboarding_prerequisites();

commit;
