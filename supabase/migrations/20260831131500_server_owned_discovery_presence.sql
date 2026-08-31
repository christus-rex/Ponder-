begin;

-- Discovery batch issuance and presence lookup are backend orchestration
-- concerns. Authenticated clients must not be able to mint arbitrary batches
-- that can then authorize presence probes.
revoke execute on function public.record_resonance_impression_batch(uuid[], smallint[], text[])
  from public, anon, authenticated;
revoke execute on function public.presence_for_discovery_batch(uuid)
  from public, anon, authenticated;

drop function public.record_resonance_impression_batch(uuid[], smallint[], text[]);
drop function public.presence_for_discovery_batch(uuid);

create or replace function public.record_resonance_impression_batch_for_user(
  p_viewer_id uuid,
  p_candidate_ids uuid[],
  p_scores smallint[],
  p_reason_codes text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_id uuid;
  candidate_count integer := cardinality(p_candidate_ids);
begin
  if p_viewer_id is null then
    raise exception 'Viewer id is required';
  end if;

  if not exists (
    select 1
    from public.user_access ua
    join public.user_private up on up.id = ua.id
    join public.profiles profile on profile.id = ua.id
    join public.user_preferences preferences on preferences.id = ua.id
    where ua.id = p_viewer_id
      and ua.account_status = 'active'::public.account_status
      and up.date_of_birth <= (current_date - interval '18 years')::date
      and up.terms_accepted_at is not null
      and profile.onboarding_completed_at is not null
  ) then
    raise exception 'Full app access required';
  end if;

  if candidate_count is null or candidate_count < 1 or candidate_count > 12 then
    raise exception 'Impression batch must contain between 1 and 12 candidates';
  end if;

  if cardinality(p_scores) is distinct from candidate_count
    or cardinality(p_reason_codes) is distinct from candidate_count then
    raise exception 'Impression arrays must have equal length';
  end if;

  if exists (
    select 1
    from unnest(p_candidate_ids) as candidates(candidate_id)
    group by candidate_id
    having count(*) > 1
  ) then
    raise exception 'Impression candidates must be unique';
  end if;

  if p_viewer_id = any(p_candidate_ids) then
    raise exception 'Viewer cannot be their own discovery candidate';
  end if;

  if exists (
    select 1
    from unnest(p_scores) as scores(score)
    where score < 0 or score > 100
  ) then
    raise exception 'Resonance score must be between 0 and 100';
  end if;

  if exists (
    select 1
    from unnest(p_reason_codes) as reasons(reason_code)
    where reason_code not in (
      'same_intent',
      'complementary_intent',
      'shared_interests',
      'compatible_intent'
    )
  ) then
    raise exception 'Unknown resonance reason code';
  end if;

  if exists (
    select 1
    from unnest(p_candidate_ids) as candidates(candidate_id)
    where not public.profile_is_discoverable(candidate_id)
  ) then
    raise exception 'All discovery candidates must be active, onboarded profiles';
  end if;

  insert into public.discovery_impression_batches(viewer_id)
  values (p_viewer_id)
  returning id into batch_id;

  insert into public.discovery_impressions(
    batch_id,
    viewer_id,
    candidate_id,
    rank,
    score,
    reason_code
  )
  select
    batch_id,
    p_viewer_id,
    candidate_id,
    rank_position::smallint,
    p_scores[rank_position::integer]::smallint,
    p_reason_codes[rank_position::integer]::public.resonance_reason_code
  from unnest(p_candidate_ids) with ordinality as ranked(candidate_id, rank_position);

  return batch_id;
end;
$$;

create or replace function public.presence_for_discovery_batch_for_user(
  p_viewer_id uuid,
  p_batch_id uuid
)
returns table(user_id uuid, available_now boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  batch_created_at timestamptz;
begin
  if p_viewer_id is null then
    raise exception 'Viewer id is required';
  end if;

  if not exists (
    select 1
    from public.user_access ua
    join public.user_private up on up.id = ua.id
    join public.profiles profile on profile.id = ua.id
    join public.user_preferences preferences on preferences.id = ua.id
    where ua.id = p_viewer_id
      and ua.account_status = 'active'::public.account_status
      and up.date_of_birth <= (current_date - interval '18 years')::date
      and up.terms_accepted_at is not null
      and profile.onboarding_completed_at is not null
  ) then
    raise exception 'Full app access required';
  end if;

  select batch.created_at
  into batch_created_at
  from public.discovery_impression_batches batch
  where batch.id = p_batch_id
    and batch.viewer_id = p_viewer_id;

  if batch_created_at is null then
    raise exception 'Discovery batch is not owned by the viewer';
  end if;

  if batch_created_at < now() - interval '10 minutes' then
    raise exception 'Discovery batch has expired';
  end if;

  return query
  select
    impression.candidate_id,
    coalesce(
      preferences.show_online_status
      and presence.last_seen_at >= now() - interval '2 minutes',
      false
    ) as available_now
  from public.discovery_impressions impression
  join public.profiles profile on profile.id = impression.candidate_id
  left join public.user_preferences preferences
    on preferences.id = impression.candidate_id
  left join public.user_presence presence
    on presence.user_id = impression.candidate_id
  where impression.batch_id = p_batch_id
    and impression.viewer_id = p_viewer_id
    and public.profile_is_discoverable(impression.candidate_id)
  order by impression.rank;
end;
$$;

revoke execute on function public.record_resonance_impression_batch_for_user(uuid, uuid[], smallint[], text[])
  from public, anon, authenticated;
revoke execute on function public.presence_for_discovery_batch_for_user(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.record_resonance_impression_batch_for_user(uuid, uuid[], smallint[], text[])
  to service_role;
grant execute on function public.presence_for_discovery_batch_for_user(uuid, uuid)
  to service_role;

commit;
