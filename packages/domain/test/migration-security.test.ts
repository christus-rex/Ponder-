import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const foundation = readFileSync(
  'supabase/migrations/20260830202042_identity_persistence.sql',
  'utf8'
);
const hardening = readFileSync(
  'supabase/migrations/20260830202118_backend_hardening.sql',
  'utf8'
);
const onboarding = readFileSync(
  'supabase/migrations/20260830202544_onboarding_preferences.sql',
  'utf8'
);
const telemetry = readFileSync(
  'supabase/migrations/20260831011212_resonance_telemetry.sql',
  'utf8'
);
const roomLifecycle = readFileSync(
  'supabase/migrations/20260831093422_server_owned_room_lifecycle.sql',
  'utf8'
);
const presenceOutcomes = readFileSync(
  'supabase/migrations/20260831054742_presence_and_resonance_outcomes.sql',
  'utf8'
);
const roomMembership = readFileSync(
  'supabase/migrations/20260831105812_server_owned_room_membership.sql',
  'utf8'
);
const dormantSurfaceFreeze = readFileSync(
  'supabase/migrations/20260831105828_freeze_unused_client_surfaces.sql',
  'utf8'
);
const sql =
  foundation +
  '\n' +
  hardening +
  '\n' +
  onboarding +
  '\n' +
  telemetry +
  '\n' +
  roomLifecycle +
  '\n' +
  presenceOutcomes +
  '\n' +
  roomMembership +
  '\n' +
  dormantSurfaceFreeze;

test('18+ eligibility is enforced during signup and in private account data', () => {
  assert.match(
    foundation,
    /constraint adult_only check \(date_of_birth <= \(current_date - interval '18 years'\)::date\)/i
  );
  assert.match(
    foundation,
    /handle_new_user[\s\S]*Ponder\+ requires an adult date of birth/i
  );
});

test('private age and verification data is owner-readable only', () => {
  assert.match(
    foundation,
    /users read own private record[\s\S]*id = \(select auth\.uid\(\)\)/i
  );

  const userPrivatePolicies = foundation
    .split(/create policy /i)
    .map((chunk) => chunk.split(';', 1)[0] ?? '')
    .filter((chunk) => /on public\.user_private/i.test(chunk));

  assert.ok(userPrivatePolicies.length >= 1);
  assert.equal(
    userPrivatePolicies.some((policy) => /using \(true\)/i.test(policy)),
    false
  );
});

test('clients cannot self-promote age verification state', () => {
  assert.match(
    hardening,
    /revoke update on public\.user_private from authenticated/i
  );
  assert.match(
    hardening,
    /grant update \(terms_accepted_at\) on public\.user_private to authenticated/i
  );
});

test('signup security-definer function is not exposed as client RPC', () => {
  for (const role of ['public', 'anon', 'authenticated']) {
    assert.match(
      hardening,
      new RegExp(
        `revoke execute on function public\\.handle_new_user\\(\\) from ${role}`,
        'i'
      )
    );
  }
});

test('direct client room lifecycle mutations are revoked in favor of backend orchestration', () => {
  assert.match(
    roomLifecycle,
    /revoke insert, update on table public\.rooms from authenticated/i
  );
  assert.match(
    roomLifecycle,
    /drop policy if exists "users create own rooms" on public\.rooms/i
  );
  assert.match(
    roomLifecycle,
    /drop policy if exists "room creators update rooms" on public\.rooms/i
  );
  assert.doesNotMatch(
    roomLifecycle,
    /grant[^;]*(insert|update)[^;]*public\.rooms[^;]*authenticated/i
  );
});

test('dormant messaging and wallet-link tables have no browser access', () => {
  assert.match(
    dormantSurfaceFreeze,
    /revoke all on table public\.messages from anon, authenticated/i
  );
  assert.match(
    dormantSurfaceFreeze,
    /revoke all on table public\.wallet_links from anon, authenticated/i
  );
  for (const policy of [
    'room members read messages',
    'room members send messages',
    'authors edit messages',
    'users manage own wallet links',
    'users add own wallet links',
    'users remove own wallet links'
  ]) {
    assert.match(
      dormantSurfaceFreeze,
      new RegExp(`drop policy if exists "${policy}"`, 'i')
    );
  }
});

test('ledger tables are fully server-owned until a reviewed financial API exists', () => {
  for (const table of [
    'ledger_accounts',
    'ledger_entries',
    'ledger_postings'
  ]) {
    assert.match(
      dormantSurfaceFreeze,
      new RegExp(
        `revoke all on table public\\.${table} from anon, authenticated`,
        'i'
      )
    );
  }

  for (const policy of [
    'users read own ledger accounts',
    'users read entries touching own accounts',
    'users read own postings'
  ]) {
    assert.match(
      dormantSurfaceFreeze,
      new RegExp(`drop policy if exists "${policy}"`, 'i')
    );
  }
});

test('all core user-facing tables enable row-level security', () => {
  for (const table of [
    'profiles',
    'user_private',
    'rooms',
    'room_members',
    'messages',
    'connections',
    'wallet_links',
    'ledger_accounts',
    'ledger_entries',
    'ledger_postings',
    'discovery_impression_batches',
    'discovery_impressions',
    'discovery_outcomes',
    'user_presence'
  ]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`, 'i')
    );
  }
});

test('advisor-recommended foreign-key indexes are declared', () => {
  for (const index of [
    'connections_addressee_idx',
    'ledger_postings_account_idx',
    'messages_sender_idx',
    'rooms_created_by_idx'
  ]) {
    assert.match(hardening, new RegExp(`create index if not exists ${index}`, 'i'));
  }
});


test('mature-content preference is private and owner-scoped', () => {
  assert.match(onboarding, /alter table public\.user_preferences enable row level security/i);
  assert.match(
    onboarding,
    /users read own preferences[\s\S]*id = \(select auth\.uid\(\)\)/i
  );
  assert.match(
    onboarding,
    /users update own preferences[\s\S]*id = \(select auth\.uid\(\)\)/i
  );
});

test('terms acceptance is server-stamped and cannot be rewritten', () => {
  assert.match(onboarding, /create or replace function public\.stamp_terms_acceptance/i);
  assert.match(onboarding, /new\.terms_accepted_at := now\(\)/i);
  assert.match(onboarding, /Terms acceptance cannot be revoked or rewritten/i);
});

test('onboarding completion requires terms and preferences at the database boundary', () => {
  assert.match(onboarding, /profiles_require_onboarding_prerequisites/i);
  assert.match(onboarding, /terms_accepted_at is not null/i);
  assert.match(onboarding, /from public\.user_preferences pref/i);
});

test('new users receive a private preferences row', () => {
  assert.match(
    onboarding,
    /insert into public\.user_preferences \(id\)[\s\S]*values \(new\.id\)/i
  );
});


test('resonance telemetry tables are closed to direct client access', () => {
  for (const table of [
    'discovery_impression_batches',
    'discovery_impressions',
    'discovery_outcomes'
  ]) {
    assert.match(
      telemetry,
      new RegExp(`revoke all on public\\.${table} from anon, authenticated`, 'i')
    );
  }
});

test('impression RPC derives viewer identity and constrains analytics shape', () => {
  assert.match(telemetry, /viewer uuid := auth\.uid\(\)/i);
  assert.match(telemetry, /candidate_count < 1 or candidate_count > 12/i);
  assert.match(telemetry, /viewer = any\(p_candidate_ids\)/i);
  assert.match(telemetry, /score < 0 or score > 100/i);
  assert.match(telemetry, /All discovery candidates must be active, onboarded profiles/i);
  assert.match(
    telemetry,
    /grant execute on function public\.record_resonance_impression_batch\(uuid\[\], smallint\[\], text\[\]\)[\s\S]*to authenticated/i
  );
});

test('outcome RPC resolves an owned impression from batch plus candidate', () => {
  assert.match(
    telemetry,
    /where di\.batch_id = p_batch_id[\s\S]*di\.candidate_id = p_candidate_id/i
  );
  assert.match(
    telemetry,
    /stored_viewer is null or stored_viewer <> viewer/i
  );
  assert.match(telemetry, /on conflict do nothing/i);
});

test('resonance telemetry stores structured signals rather than conversation content', () => {
  const tableDefinitions = telemetry
    .split(/create table public\./i)
    .filter((chunk) => /^discovery_(impression_batches|impressions|outcomes)/i.test(chunk))
    .join('\n');

  assert.doesNotMatch(
    tableDefinitions,
    /\b(message|body|caption|transcript|audio|video|bio|interests|search_text)\b/i
  );
});


test('discoverability helper remains a valid security-definer SQL function', () => {
  assert.match(
    telemetry,
    /create or replace function public\.profile_is_discoverable\(target_user_id uuid\)[\s\S]*security definer[\s\S]*as \$\$[\s\S]*\$\$;/i
  );
  assert.match(
    telemetry,
    /active profiles are discoverable[\s\S]*profile_is_discoverable\(id\)/i
  );
});


test('online availability is opt-in and raw presence is not client-readable', () => {
  assert.match(
    presenceOutcomes,
    /add column if not exists show_online_status boolean not null default false/i
  );
  assert.match(
    presenceOutcomes,
    /alter table public\.user_presence enable row level security/i
  );
  assert.match(
    presenceOutcomes,
    /revoke all on public\.user_presence from anon, authenticated/i
  );
  assert.match(
    presenceOutcomes,
    /returns table\(user_id uuid, available_now boolean\)/i
  );
});

test('presence heartbeat derives identity and requires full app access', () => {
  assert.match(
    presenceOutcomes,
    /create or replace function public\.heartbeat_presence\(\)[\s\S]*viewer uuid := auth\.uid\(\)/i
  );
  assert.match(
    presenceOutcomes,
    /heartbeat_presence\(\)[\s\S]*current_user_can_enter\(\)/i
  );
  assert.match(
    presenceOutcomes,
    /presence lookup must contain between 1 and 48 candidates/i
  );
});

test('presence-enabled ranking uses an explicit telemetry algorithm version', () => {
  assert.match(
    presenceOutcomes,
    /alter column algorithm_version set default 'resonance_v1_presence'/i
  );
  assert.match(
    presenceOutcomes,
    /algorithm_version in \('resonance_v1', 'resonance_v1_presence'\)/i
  );
});

test('resonance outcomes verify durable connection and shared-room state', () => {
  assert.match(
    presenceOutcomes,
    /connection_requested outcome requires a matching connection/i
  );
  assert.match(
    presenceOutcomes,
    /connection_accepted outcome requires an accepted connection/i
  );
  assert.match(
    presenceOutcomes,
    /room_entered outcome requires both users to be active room members/i
  );
  assert.match(
    presenceOutcomes,
    /reported outcome is unavailable until durable moderation reports ship/i
  );
  assert.match(
    presenceOutcomes,
    /repeat_interaction outcome is unavailable until durable interaction history ships/i
  );
});

test('connection continuation is server-authoritative and telemetry follows the mutation', () => {
  assert.match(
    presenceOutcomes,
    /create or replace function public\.request_connection_from_resonance/i
  );
  assert.match(
    presenceOutcomes,
    /if inbound_status = 'pending'::public\.connection_status[\s\S]*update public\.connections[\s\S]*record_resonance_outcome/i
  );
  assert.match(
    presenceOutcomes,
    /insert into public\.connections\(requester_id, addressee_id, status\)[\s\S]*record_resonance_outcome/i
  );
  assert.match(
    presenceOutcomes,
    /Connection is blocked/i
  );
});


test('room membership lifecycle is server-owned and ejection cannot be client-reversed', () => {
  assert.match(
    roomMembership,
    /revoke insert, update, delete on table public\.room_members from authenticated/i
  );
  assert.match(
    roomMembership,
    /drop policy if exists "users join as themselves" on public\.room_members/i
  );
  assert.match(
    roomMembership,
    /drop policy if exists "users update own membership" on public\.room_members/i
  );
  assert.match(
    roomMembership,
    /drop policy if exists "users leave rooms" on public\.room_members/i
  );
  assert.match(
    roomMembership,
    /users read own room membership[\s\S]*user_id = \(select auth\.uid\(\)\)/i
  );
});

test('host ejection is durable, audited, and callable only through service role', () => {
  assert.match(
    roomMembership,
    /entry_state in \('active', 'ejected'\)/i
  );
  assert.match(
    roomMembership,
    /create table public\.room_member_moderation_actions/i
  );
  assert.match(
    roomMembership,
    /create or replace function public\.host_eject_room_member/i
  );
  assert.match(
    roomMembership,
    /r\.created_by = p_actor_id[\s\S]*r\.status = 'open'/i
  );
  assert.match(
    roomMembership,
    /set[\s\S]*entry_state = 'ejected'[\s\S]*ejected_at = now\(\)[\s\S]*left_at = now\(\)/i
  );
  assert.match(
    roomMembership,
    /revoke execute on function public\.host_eject_room_member\(uuid, uuid, uuid, text\)[\s\S]*from public, anon, authenticated/i
  );
  assert.match(
    roomMembership,
    /grant execute on function public\.host_eject_room_member\(uuid, uuid, uuid, text\)[\s\S]*to service_role/i
  );
});