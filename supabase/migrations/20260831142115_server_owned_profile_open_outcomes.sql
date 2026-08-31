begin;

-- The generic outcome helper is still used internally by the authenticated
-- connection mutation RPC, but browsers do not need to execute it directly.
revoke execute on function public.record_resonance_outcome(uuid, uuid, text, uuid)
  from public, anon, authenticated;

create or replace function public.record_profile_opened_for_user(
  p_viewer_id uuid,
  p_batch_id uuid,
  p_candidate_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  impression_id bigint;
begin
  if p_viewer_id is null then
    raise exception 'Viewer id is required';
  end if;

  if not exists (
    select 1
    from public.user_access ua
    join public.user_private up on up.id = ua.id
    join public.profiles profile on profile.id = ua.id
    where ua.id = p_viewer_id
      and ua.account_status = 'active'::public.account_status
      and up.date_of_birth <= (current_date - interval '18 years')::date
      and up.terms_accepted_at is not null
      and profile.onboarding_completed_at is not null
  ) then
    raise exception 'Full app access required';
  end if;

  select di.id
  into impression_id
  from public.discovery_impressions di
  join public.discovery_impression_batches batch on batch.id = di.batch_id
  where di.batch_id = p_batch_id
    and di.viewer_id = p_viewer_id
    and di.candidate_id = p_candidate_id
    and batch.viewer_id = p_viewer_id
    and batch.created_at >= now() - interval '10 minutes';

  if impression_id is null then
    raise exception 'Active discovery impression is not owned by the viewer';
  end if;

  insert into public.discovery_outcomes(
    impression_id,
    viewer_id,
    outcome_kind,
    room_id
  )
  values (
    impression_id,
    p_viewer_id,
    'profile_opened'::public.resonance_outcome_kind,
    null
  )
  on conflict do nothing;

  return true;
end;
$$;

revoke execute on function public.record_profile_opened_for_user(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_profile_opened_for_user(uuid, uuid, uuid)
  to service_role;

commit;
