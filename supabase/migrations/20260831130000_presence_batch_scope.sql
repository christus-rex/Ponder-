begin;

-- Presence is a contextual signal for a server-issued discovery result, not a
-- general authenticated UUID lookup. Retire the arbitrary candidate-array RPC
-- and expose availability only for candidates in a recent batch owned by the
-- authenticated viewer.
revoke execute on function public.presence_for_candidates(uuid[])
  from public, anon, authenticated;
drop function public.presence_for_candidates(uuid[]);

create or replace function public.presence_for_discovery_batch(p_batch_id uuid)
returns table(user_id uuid, available_now boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  batch_created_at timestamptz;
begin
  if viewer is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_can_enter() then
    raise exception 'Full app access required';
  end if;

  select batch.created_at
  into batch_created_at
  from public.discovery_impression_batches batch
  where batch.id = p_batch_id
    and batch.viewer_id = viewer;

  if batch_created_at is null then
    raise exception 'Discovery batch is not owned by the authenticated viewer';
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
    and impression.viewer_id = viewer
    and public.profile_is_discoverable(impression.candidate_id)
  order by impression.rank;
end;
$$;

revoke execute on function public.presence_for_discovery_batch(uuid)
  from public, anon;
grant execute on function public.presence_for_discovery_batch(uuid)
  to authenticated;

commit;
