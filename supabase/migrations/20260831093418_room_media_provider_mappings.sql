begin;

create table public.room_media_provider_mappings (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  provider text not null,
  provider_meeting_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_media_provider_supported check (provider = 'realtimekit'),
  constraint room_media_provider_meeting_id_length check (
    char_length(provider_meeting_id) between 1 and 200
  ),
  unique (provider, provider_meeting_id)
);

create trigger room_media_provider_mappings_updated_at
before update on public.room_media_provider_mappings
for each row execute procedure public.set_updated_at();

alter table public.room_media_provider_mappings enable row level security;

-- Provider meeting identities are backend infrastructure, not room metadata.
-- Browser roles receive no table privileges and there are intentionally no RLS policies.
revoke all on table public.room_media_provider_mappings from anon, authenticated;
grant select, insert, update, delete on table public.room_media_provider_mappings to service_role;

commit;
