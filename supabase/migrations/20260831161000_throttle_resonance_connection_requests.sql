begin;

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
  recent_outbound_count integer;
  batch_created_at timestamptz;
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

  if p_batch_id is not null then
    select batch.created_at
    into batch_created_at
    from public.discovery_impression_batches batch
    join public.discovery_impressions impression
      on impression.batch_id = batch.id
     and impression.viewer_id = viewer
     and impression.candidate_id = p_candidate_id
    where batch.id = p_batch_id
      and batch.viewer_id = viewer;

    if batch_created_at is null then
      raise exception 'Discovery batch is not owned by the viewer or does not contain the candidate';
    end if;

    if batch_created_at < now() - interval '10 minutes' then
      raise exception 'Discovery batch has expired';
    end if;
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

  select count(*)::integer
  into recent_outbound_count
  from public.connections c
  where c.requester_id = viewer
    and c.created_at >= now() - interval '10 minutes';

  if recent_outbound_count >= 20 then
    raise exception 'Too many new connection requests; try again later';
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
