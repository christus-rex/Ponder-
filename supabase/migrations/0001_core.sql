create extension if not exists pgcrypto;

create type public.account_status as enum ('active','limited','suspended','closed');
create type public.world_visibility as enum ('public','members','private');
create type public.content_rating as enum ('mature','after_dark');
create type public.room_status as enum ('scheduled','live','ended','cancelled');
create type public.participant_role as enum ('host','moderator','speaker','viewer');
create type public.message_status as enum ('visible','held','removed');
create type public.ledger_direction as enum ('credit','debit');
create type public.ledger_leg as enum ('sender_debit','creator_credit','adjustment');
create type public.report_status as enum ('open','triaged','resolved','dismissed');
create type public.report_reason as enum ('harassment','hate','sexual_content','violence','spam','impersonation','underage_concern','other');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[A-Za-z0-9_]{3,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text check (bio is null or char_length(bio) <= 500),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.age_attestations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date not null,
  attested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status public.account_status not null default 'active',
  age_verified_at timestamptz,
  age_verification_method text,
  moderation_strikes integer not null default 0 check (moderation_strikes >= 0),
  updated_at timestamptz not null default now()
);

create table public.creator_profiles (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  headline text check (headline is null or char_length(headline) <= 140),
  category text,
  is_creator boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worlds (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(user_id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  description text check (description is null or char_length(description) <= 1000),
  visibility public.world_visibility not null default 'public',
  content_rating public.content_rating not null default 'mature',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index worlds_owner_idx on public.worlds(owner_user_id);
create index worlds_published_idx on public.worlds(published_at) where published_at is not null;

create table public.world_members (
  world_id uuid not null references public.worlds(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (world_id,user_id)
);
create index world_members_user_idx on public.world_members(user_id);

create table public.follows (
  follower_user_id uuid not null references public.profiles(user_id) on delete cascade,
  followed_user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id,followed_user_id),
  check (follower_user_id <> followed_user_id)
);
create index follows_followed_idx on public.follows(followed_user_id);

create table public.live_rooms (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  host_user_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  status public.room_status not null default 'scheduled',
  content_rating public.content_rating not null default 'mature',
  provider_room_id text unique,
  scheduled_for timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index live_rooms_world_idx on public.live_rooms(world_id);
create index live_rooms_status_idx on public.live_rooms(status);

create table public.room_participants (
  room_id uuid not null references public.live_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role public.participant_role not null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id,user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.live_rooms(id) on delete cascade,
  author_user_id uuid not null references public.profiles(user_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  status public.message_status not null default 'held',
  moderation_labels jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index messages_room_created_idx on public.messages(room_id,created_at desc);

create table public.gift_catalog (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  amount integer not null check (amount > 0),
  currency text not null default 'PONDER_DEMO' check (currency = 'PONDER_DEMO'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.gift_events (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null unique,
  room_id uuid not null references public.live_rooms(id) on delete cascade,
  gift_catalog_item_id uuid not null references public.gift_catalog(id),
  sender_user_id uuid not null references public.profiles(user_id) on delete restrict,
  creator_user_id uuid not null references public.profiles(user_id) on delete restrict,
  amount integer not null check (amount > 0),
  currency text not null check (currency = 'PONDER_DEMO'),
  occurred_at timestamptz not null default now(),
  check (sender_user_id <> creator_user_id)
);
create index gift_events_room_idx on public.gift_events(room_id,occurred_at desc);

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  account_user_id uuid not null references public.profiles(user_id) on delete restrict,
  correlation_id uuid not null,
  leg public.ledger_leg not null,
  direction public.ledger_direction not null,
  amount integer not null check (amount > 0),
  currency text not null check (currency = 'PONDER_DEMO'),
  reason text not null check (reason in ('gift','grant','reversal','adjustment')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(correlation_id,leg)
);
create index wallet_ledger_account_idx on public.wallet_ledger(account_user_id,occurred_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.profiles(user_id) on delete cascade,
  target_user_id uuid references public.profiles(user_id) on delete set null,
  room_id uuid references public.live_rooms(id) on delete set null,
  reason public.report_reason not null,
  details text check (details is null or char_length(details) <= 2000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_status_idx on public.reports(status,created_at);

create table public.blocks (
  blocker_user_id uuid not null references public.profiles(user_id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id,blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;


create or replace function public.enforce_adult_birth_date() returns trigger language plpgsql as $
begin
  if new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'Ponder+ requires users to be 18 or older';
  end if;
  if new.birth_date < date '1900-01-01' then
    raise exception 'Birth date is outside the supported range';
  end if;
  return new;
end;
$;

create trigger age_attestations_require_adult
before insert or update on public.age_attestations
for each row execute function public.enforce_adult_birth_date();

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger age_attestations_touch before update on public.age_attestations for each row execute function public.touch_updated_at();
create trigger account_controls_touch before update on public.account_controls for each row execute function public.touch_updated_at();
create trigger creator_profiles_touch before update on public.creator_profiles for each row execute function public.touch_updated_at();
create trigger worlds_touch before update on public.worlds for each row execute function public.touch_updated_at();
create trigger live_rooms_touch before update on public.live_rooms for each row execute function public.touch_updated_at();
create trigger reports_touch before update on public.reports for each row execute function public.touch_updated_at();

create or replace function public.prevent_ledger_mutation() returns trigger language plpgsql as $$
begin raise exception 'wallet_ledger is append-only'; end;
$$;
create trigger wallet_ledger_immutable before update or delete on public.wallet_ledger for each row execute function public.prevent_ledger_mutation();

alter table public.profiles enable row level security;
alter table public.age_attestations enable row level security;
alter table public.account_controls enable row level security;
alter table public.creator_profiles enable row level security;
alter table public.worlds enable row level security;
alter table public.world_members enable row level security;
alter table public.follows enable row level security;
alter table public.live_rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.messages enable row level security;
alter table public.gift_catalog enable row level security;
alter table public.gift_events enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;

create policy profiles_public_read on public.profiles for select using (true);
create policy profiles_insert_own on public.profiles for insert with check (user_id = auth.uid());
create policy profiles_update_own on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy age_attestations_read_own on public.age_attestations for select using (user_id = auth.uid());
create policy age_attestations_insert_own on public.age_attestations for insert with check (user_id = auth.uid());
create policy age_attestations_update_own on public.age_attestations for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- No client policies on account_controls: service role only.

create policy creator_profiles_public_read on public.creator_profiles for select using (true);
create policy creator_profiles_insert_own on public.creator_profiles for insert with check (user_id = auth.uid());
create policy creator_profiles_update_own on public.creator_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy worlds_read_visible on public.worlds for select using (owner_user_id = auth.uid() or (published_at is not null and visibility = 'public'));
create policy worlds_insert_own on public.worlds for insert with check (owner_user_id = auth.uid());
create policy worlds_update_own on public.worlds for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy worlds_delete_own on public.worlds for delete using (owner_user_id = auth.uid());

create policy world_members_read_related on public.world_members for select using (
  user_id = auth.uid() or exists (select 1 from public.worlds w where w.id = world_id and w.owner_user_id = auth.uid())
);
create policy world_members_join_self on public.world_members for insert with check (\n  user_id = auth.uid() and exists (select 1 from public.worlds w where w.id = world_id and w.published_at is not null and w.visibility = 'public')\n);
create policy world_members_leave_self on public.world_members for delete using (user_id = auth.uid());

create policy follows_read_related on public.follows for select using (follower_user_id = auth.uid() or followed_user_id = auth.uid());
create policy follows_insert_self on public.follows for insert with check (follower_user_id = auth.uid());
create policy follows_delete_self on public.follows for delete using (follower_user_id = auth.uid());

create policy live_rooms_read_visible on public.live_rooms for select using (
  host_user_id = auth.uid() or exists (
    select 1 from public.worlds w
    where w.id = world_id and w.published_at is not null and w.visibility = 'public'
  )
);
create policy live_rooms_insert_host on public.live_rooms for insert with check (
  host_user_id = auth.uid() and exists (
    select 1 from public.worlds w
    where w.id = world_id and w.owner_user_id = auth.uid()
  )
);
create policy live_rooms_update_host on public.live_rooms for update using (host_user_id = auth.uid()) with check (
  host_user_id = auth.uid() and exists (
    select 1 from public.worlds w
    where w.id = world_id and w.owner_user_id = auth.uid()
  )
);

create policy room_participants_read_self_or_host on public.room_participants for select using (
  user_id = auth.uid() or exists (select 1 from public.live_rooms r where r.id = room_id and r.host_user_id = auth.uid())
);
-- Participant role writes are server-controlled.

create policy messages_read_visible on public.messages for select using (
  status = 'visible' and exists (select 1 from public.live_rooms r where r.id = room_id and r.status in ('scheduled','live','ended'))
);
-- Durable message writes are server-controlled so moderation cannot be bypassed.

create policy gift_catalog_public_read on public.gift_catalog for select using (active = true);
create policy gift_events_read_party on public.gift_events for select using (sender_user_id = auth.uid() or creator_user_id = auth.uid());
create policy wallet_ledger_read_own on public.wallet_ledger for select using (account_user_id = auth.uid());
-- Gift and ledger writes are server-controlled.

create policy reports_insert_own on public.reports for insert with check (reporter_user_id = auth.uid() and status = 'open');
create policy reports_read_own on public.reports for select using (reporter_user_id = auth.uid());

create policy blocks_read_own on public.blocks for select using (blocker_user_id = auth.uid());
create policy blocks_insert_own on public.blocks for insert with check (blocker_user_id = auth.uid());
create policy blocks_delete_own on public.blocks for delete using (blocker_user_id = auth.uid());

insert into public.gift_catalog (sku,name,amount,currency) values
  ('spark-25','Spark',25,'PONDER_DEMO'),
  ('glow-100','Glow',100,'PONDER_DEMO'),
  ('constellation-500','Constellation',500,'PONDER_DEMO')
on conflict (sku) do nothing;
