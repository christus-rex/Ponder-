begin;

create table public.room_media_provider_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'realtimekit',
  provider_participant_id text not null,
  authority_sequence bigint not null,
  role text not null,
  expires_at timestamptz not null,
  is_current boolean not null default true,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_media_session_provider check (provider = 'realtimekit'),
  constraint room_media_session_participant_id_length check (
    char_length(provider_participant_id) between 1 and 200
  ),
  constraint room_media_session_sequence check (authority_sequence >= 0),
  constraint room_media_session_role check (
    role in ('host', 'moderator', 'speaker', 'viewer')
  ),
  unique (provider, provider_participant_id)
);

create trigger room_media_provider_sessions_updated_at
before update on public.room_media_provider_sessions
for each row execute procedure public.set_updated_at();

create unique index room_media_provider_sessions_current_user_idx
on public.room_media_provider_sessions(room_id, user_id)
where is_current and revoked_at is null;

create index room_media_provider_sessions_active_room_idx
on public.room_media_provider_sessions(room_id)
where revoked_at is null;

alter table public.room_media_provider_sessions enable row level security;

-- Provider participant IDs are revocation handles. They are backend
-- infrastructure and must never become client-readable room metadata.
revoke all on table public.room_media_provider_sessions from anon, authenticated;
grant select, insert, update, delete
on table public.room_media_provider_sessions to service_role;

create or replace function public.register_room_media_provider_session(
  p_room_id uuid,
  p_user_id uuid,
  p_provider_participant_id text,
  p_authority_sequence bigint,
  p_role text,
  p_expires_at timestamptz
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_participant_ids text[];
begin
  -- Serialize session replacement for one room/user without holding an
  -- application process lock. This prevents concurrent exchanges from
  -- overwriting the only revocation handle for an active provider participant.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_room_id::text || ':' || p_user_id::text, 0)
  );

  select coalesce(array_agg(s.provider_participant_id), '{}'::text[])
  into previous_participant_ids
  from public.room_media_provider_sessions s
  where s.room_id = p_room_id
    and s.user_id = p_user_id
    and s.revoked_at is null
    and s.provider_participant_id <> p_provider_participant_id;

  update public.room_media_provider_sessions
  set is_current = false
  where room_id = p_room_id
    and user_id = p_user_id
    and is_current
    and revoked_at is null;

  insert into public.room_media_provider_sessions (
    room_id,
    user_id,
    provider,
    provider_participant_id,
    authority_sequence,
    role,
    expires_at,
    is_current
  )
  values (
    p_room_id,
    p_user_id,
    'realtimekit',
    p_provider_participant_id,
    p_authority_sequence,
    p_role,
    p_expires_at,
    true
  )
  on conflict (provider, provider_participant_id)
  do update set
    authority_sequence = excluded.authority_sequence,
    role = excluded.role,
    expires_at = excluded.expires_at,
    revoked_at = null,
    is_current = true;

  return previous_participant_ids;
end;
$$;

revoke execute on function public.register_room_media_provider_session(
  uuid, uuid, text, bigint, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.register_room_media_provider_session(
  uuid, uuid, text, bigint, text, timestamptz
) to service_role;

commit;
