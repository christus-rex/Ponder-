begin;

alter table public.room_media_provider_sessions
  add column reconciliation_requested_at timestamptz,
  add column reconciliation_attempts integer not null default 0,
  add column reconciliation_lease_until timestamptz,
  add column next_reconciliation_at timestamptz;

alter table public.room_media_provider_sessions
  add constraint room_media_reconciliation_attempts_nonnegative
  check (reconciliation_attempts >= 0);

create index room_media_provider_sessions_reconciliation_idx
on public.room_media_provider_sessions(next_reconciliation_at, created_at)
where revoked_at is null and reconciliation_requested_at is not null;

create or replace function public.claim_room_media_revocations(
  p_limit integer default 16,
  p_lease_seconds integer default 60
)
returns table (
  room_id uuid,
  user_id uuid,
  provider_participant_id text,
  authority_sequence bigint,
  role text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 32 then
    raise exception 'reconciliation limit out of range';
  end if;
  if p_lease_seconds < 15 or p_lease_seconds > 300 then
    raise exception 'reconciliation lease out of range';
  end if;

  return query
  with candidates as (
    select s.id
    from public.room_media_provider_sessions s
    where s.revoked_at is null
      and s.reconciliation_requested_at is not null
      and (s.reconciliation_lease_until is null or s.reconciliation_lease_until <= pg_catalog.now())
      and (s.next_reconciliation_at is null or s.next_reconciliation_at <= pg_catalog.now())
    order by coalesce(s.next_reconciliation_at, s.reconciliation_requested_at), s.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.room_media_provider_sessions s
    set reconciliation_attempts = s.reconciliation_attempts + 1,
        reconciliation_lease_until = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
        next_reconciliation_at = pg_catalog.now() + pg_catalog.make_interval(
          secs => least(300, 15 * (1 << least(s.reconciliation_attempts, 4)))
        )
    from candidates c
    where s.id = c.id
    returning s.room_id, s.user_id, s.provider_participant_id,
      s.authority_sequence, s.role, s.expires_at
  )
  select c.room_id, c.user_id, c.provider_participant_id,
    c.authority_sequence, c.role, c.expires_at
  from claimed c;
end;
$$;

revoke execute on function public.claim_room_media_revocations(integer, integer)
from public, anon, authenticated;
grant execute on function public.claim_room_media_revocations(integer, integer)
to service_role;

-- Safely seed obvious stale handles from before reconciliation existed. Current
-- sessions in open rooms are deliberately excluded because they may still be
-- legitimate live media sessions.
update public.room_media_provider_sessions s
set reconciliation_requested_at = pg_catalog.now(),
    next_reconciliation_at = pg_catalog.now()
where s.revoked_at is null
  and (
    not s.is_current
    or s.expires_at <= pg_catalog.now()
    or exists (
      select 1 from public.rooms r
      where r.id = s.room_id and r.status <> 'open'
    )
  );

commit;
