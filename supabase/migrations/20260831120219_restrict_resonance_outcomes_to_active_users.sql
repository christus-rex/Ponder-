begin;

-- Resonance outcome telemetry is an authenticated client RPC because the
-- browser records user-visible discovery outcomes. Keep the function
-- SECURITY DEFINER so the locked telemetry tables remain inaccessible
-- directly, but re-check current app eligibility on every write. This closes
-- the window where a user suspended after receiving a discovery batch could
-- continue writing telemetry with a previously valid batch id.
create or replace function public.record_resonance_outcome(
  p_batch_id uuid,
  p_candidate_id uuid,
  p_outcome_kind text,
  p_room_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  stored_viewer uuid;
  stored_candidate uuid;
  impression_id bigint;
  parsed_kind public.resonance_outcome_kind;
begin
  if viewer is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_can_enter() then
    raise exception 'Full app access required';
  end if;

  begin
    parsed_kind := p_outcome_kind::public.resonance_outcome_kind;
  exception
    when invalid_text_representation then
      raise exception 'Unknown resonance outcome kind';
  end;

  select di.viewer_id, di.candidate_id, di.id
  into stored_viewer, stored_candidate, impression_id
  from public.discovery_impressions di
  where di.batch_id = p_batch_id
    and di.candidate_id = p_candidate_id;

  if stored_viewer is null or stored_viewer <> viewer then
    raise exception 'Impression is not owned by the authenticated viewer';
  end if;

  if parsed_kind = 'room_entered'::public.resonance_outcome_kind then
    if p_room_id is null then
      raise exception 'room_entered outcome requires a room id';
    end if;

    if not exists (
      select 1
      from public.room_members viewer_membership
      join public.room_members candidate_membership
        on candidate_membership.room_id = viewer_membership.room_id
       and candidate_membership.user_id = stored_candidate
       and candidate_membership.left_at is null
      where viewer_membership.room_id = p_room_id
        and viewer_membership.user_id = viewer
        and viewer_membership.left_at is null
    ) then
      raise exception 'room_entered outcome requires both users to be active room members';
    end if;
  elsif parsed_kind = 'connection_requested'::public.resonance_outcome_kind then
    if not exists (
      select 1
      from public.connections c
      where c.requester_id = viewer
        and c.addressee_id = stored_candidate
        and c.status in ('pending'::public.connection_status, 'accepted'::public.connection_status)
    ) then
      raise exception 'connection_requested outcome requires a matching connection';
    end if;
  elsif parsed_kind = 'connection_accepted'::public.resonance_outcome_kind then
    if not exists (
      select 1
      from public.connections c
      where (
          (c.requester_id = viewer and c.addressee_id = stored_candidate)
          or (c.requester_id = stored_candidate and c.addressee_id = viewer)
        )
        and c.status = 'accepted'::public.connection_status
    ) then
      raise exception 'connection_accepted outcome requires an accepted connection';
    end if;
  elsif parsed_kind = 'blocked'::public.resonance_outcome_kind then
    if not exists (
      select 1
      from public.connections c
      where (
          (c.requester_id = viewer and c.addressee_id = stored_candidate)
          or (c.requester_id = stored_candidate and c.addressee_id = viewer)
        )
        and c.status = 'blocked'::public.connection_status
    ) then
      raise exception 'blocked outcome requires a blocked connection state';
    end if;
  elsif parsed_kind = 'reported'::public.resonance_outcome_kind then
    raise exception 'reported outcome is unavailable until durable moderation reports ship';
  elsif parsed_kind = 'repeat_interaction'::public.resonance_outcome_kind then
    raise exception 'repeat_interaction outcome is unavailable until durable interaction history ships';
  end if;

  insert into public.discovery_outcomes(
    impression_id,
    viewer_id,
    outcome_kind,
    room_id
  )
  values (
    impression_id,
    viewer,
    parsed_kind,
    p_room_id
  )
  on conflict do nothing;

  return true;
end;
$$;

-- Preserve the deliberately narrow public API surface explicitly. The
-- function remains unavailable to anonymous/public callers and executable only
-- by signed-in users whose eligibility is checked inside the function.
revoke execute on function public.record_resonance_outcome(uuid, uuid, text, uuid)
  from public, anon;
grant execute on function public.record_resonance_outcome(uuid, uuid, text, uuid)
  to authenticated;

commit;
