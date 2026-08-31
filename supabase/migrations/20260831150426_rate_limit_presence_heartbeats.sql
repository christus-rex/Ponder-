begin;

-- Presence heartbeat remains a legitimate authenticated client RPC, but repeated
-- calls must not amplify into unbounded writes. The server owns the timestamp
-- and suppresses writes that arrive within a short minimum interval.
create or replace function public.heartbeat_presence()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  seen_at timestamptz := now();
  previous_seen_at timestamptz;
begin
  if viewer is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_can_enter() then
    raise exception 'Full app access required';
  end if;

  select presence.last_seen_at
  into previous_seen_at
  from public.user_presence presence
  where presence.user_id = viewer;

  if previous_seen_at is not null
    and previous_seen_at >= seen_at - interval '30 seconds' then
    return previous_seen_at;
  end if;

  insert into public.user_presence(user_id, last_seen_at)
  values (viewer, seen_at)
  on conflict (user_id)
  do update set last_seen_at = excluded.last_seen_at;

  return seen_at;
end;
$$;

revoke execute on function public.heartbeat_presence() from public, anon;
grant execute on function public.heartbeat_presence() to authenticated;

commit;
