begin;

drop policy if exists "active profiles are discoverable" on public.profiles;
create policy "own profile or active discovery"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (
    (select public.current_user_is_active())
    and onboarding_completed_at is not null
  )
);

commit;
