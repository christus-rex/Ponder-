begin;

-- Live room lifecycle mutations are server-owned. Authenticated clients retain
-- read access to non-archived rooms, but can no longer create or update room
-- lifecycle records directly.
revoke insert, update on table public.rooms from authenticated;

drop policy if exists "users create own rooms" on public.rooms;
drop policy if exists "room creators update rooms" on public.rooms;

comment on table public.rooms is
  'Ponder+ live rooms. Creation/status lifecycle mutations are backend-authoritative; authenticated clients are read-only.';

commit;
