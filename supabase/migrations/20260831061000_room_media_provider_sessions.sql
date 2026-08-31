begin;

create table public.room_media_provider_sessions (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'realtimekit',
  provider_participant_id text not null,
  authority_sequence bigint not null,
  role text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id),
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

create index room_media_provider_sessions_active_room_idx
on public.room_media_provider_sessions(room_id)
where revoked_at is null;

alter table public.room_media_provider_sessions enable row level security;

-- Provider participant IDs are revocation handles. They are backend
-- infrastructure and must never become client-readable room metadata.
revoke all on table public.room_media_provider_sessions from anon, authenticated;
grant select, insert, update, delete
on table public.room_media_provider_sessions to service_role;

commit;
