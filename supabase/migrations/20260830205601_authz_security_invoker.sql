begin;

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security invoker
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
security invoker
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
security invoker
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
security invoker
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

commit;
