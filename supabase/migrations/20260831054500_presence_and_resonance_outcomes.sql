begin;

alter table public.user_preferences
  add column if not exists show_online_status boolean not null default false;

create table public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.user_presence enable row level security;

revoke all on public.user_presence from anon, authenticated;

create or replace function public.heartbeat_presence()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  seen_at timestamptz := now();
begin
  if viewer is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_can_enter() then
    raise exception 'Full app access required';
  end if;

  insert into public.user_presence(user_id, last_seen_at)
  values (viewer, seen_at)
  on conflict (user_id)
  do update set last_seen_at = excluded.last_seen_at;

  return seen_at;
end;
$$;

create or replace function public.presence_for_candidates(p_candidate_ids uuid[])
returns table(user_id uuid, available_now boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  candidate_count integer := cardinality(p_candidate_ids);
begin
  if viewer is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_can_enter() then
    raise exception 'Full app access required';
  end if;

  if candidate_count is null or candidate_count < 1 or candidate_count > 48 then
    raise exception 'Presence lookup must contain between 1 and 48 candidates';
  end if;

  return query
  select
    candidates.candidate_id,
    coalesce(
      pref.show_online_status
      and presence.last_seen_at >= now() - interval '2 minutes',
      false
    ) as available_now
  from unnest(p_candidate_ids) as candidates(candidate_id)
  join public.profiles p on p.id = candidates.candidate_id
  left join public.user_preferences pref on pref.id = candidates.candidate_id
  left join public.user_presence presence on presence.user_id = candidates.candidate_id
  where public.profile_is_discoverable(candidates.candidate_id)
    and candidates.candidate_id <> viewer;
end;
$$;

revoke execute on function public.heartbeat_presence() from public, anon;
revoke execute on function public.presence_for_candidates(uuid[]) from public, anon;

grant execute on function public.heartbeat_presence() to authenticated;
grant execute on function public.presence_for_candidates(uuid[]) to authenticated;

alter table public.discovery_impression_batches
  drop constraint if exists discovery_batch_algorithm;

alter table public.discovery_impression_batches
  alter column algorithm_version set default 'resonance_v1_presence';

alter table public.discovery_impression_batches
  add constraint discovery_batch_algorithm
  check (algorithm_version in ('resonance_v1', 'resonance_v1_presence'));

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

create or replace function public.request_connection_from_resonance(
  p_candidate_id uuid,
  p_batch_id uuid default null
)
returns public.connection_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  outbound_status public.connection_status;
  inbound_status public.connection_status;
begin
  if viewer is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_can_enter() then
    raise exception 'Full app access required';
  end if;

  if viewer = p_candidate_id then
    raise exception 'Cannot connect to yourself';
  end if;

  if not public.profile_is_discoverable(p_candidate_id) then
    raise exception 'Candidate is not discoverable';
  end if;

  select c.status
  into outbound_status
  from public.connections c
  where c.requester_id = viewer
    and c.addressee_id = p_candidate_id;

  select c.status
  into inbound_status
  from public.connections c
  where c.requester_id = p_candidate_id
    and c.addressee_id = viewer;

  if outbound_status = 'blocked'::public.connection_status
    or inbound_status = 'blocked'::public.connection_status then
    raise exception 'Connection is blocked';
  end if;

  if outbound_status in ('pending'::public.connection_status, 'accepted'::public.connection_status) then
    return outbound_status;
  end if;

  if inbound_status = 'accepted'::public.connection_status then
    return 'accepted'::public.connection_status;
  end if;

  if inbound_status = 'pending'::public.connection_status then
    update public.connections
    set status = 'accepted'::public.connection_status
    where requester_id = p_candidate_id
      and addressee_id = viewer
      and status = 'pending'::public.connection_status;

    if p_batch_id is not null then
      perform public.record_resonance_outcome(
        p_batch_id,
        p_candidate_id,
        'connection_accepted',
        null
      );
    end if;

    return 'accepted'::public.connection_status;
  end if;

  insert into public.connections(requester_id, addressee_id, status)
  values (viewer, p_candidate_id, 'pending'::public.connection_status)
  on conflict (requester_id, addressee_id) do nothing;

  if p_batch_id is not null then
    perform public.record_resonance_outcome(
      p_batch_id,
      p_candidate_id,
      'connection_requested',
      null
    );
  end if;

  return 'pending'::public.connection_status;
end;
$$;

revoke execute on function public.request_connection_from_resonance(uuid, uuid)
  from public, anon;
grant execute on function public.request_connection_from_resonance(uuid, uuid)
  to authenticated;

commit;
