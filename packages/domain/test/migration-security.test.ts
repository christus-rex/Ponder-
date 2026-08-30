import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const foundation = readFileSync(
  'supabase/migrations/20260830193000_identity_persistence.sql',
  'utf8'
);
const hardening = readFileSync(
  'supabase/migrations/20260830202000_backend_hardening.sql',
  'utf8'
);
const onboarding = readFileSync(
  'supabase/migrations/20260830202500_onboarding_preferences.sql',
  'utf8'
);
const sql = foundation + '\n' + hardening + '\n' + onboarding;

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

test('room creation is constrained to the authenticated creator', () => {
  assert.match(
    foundation,
    /users create own rooms[\s\S]*created_by = \(select auth\.uid\(\)\)/i
  );
});

test('room message writes require active room membership', () => {
  assert.match(
    foundation,
    /room members send messages[\s\S]*rm\.room_id = messages\.room_id[\s\S]*rm\.user_id = \(select auth\.uid\(\)\)[\s\S]*rm\.left_at is null/i
  );
});

test('ledger tables are client read-only', () => {
  assert.match(
    foundation,
    /grant select on public\.ledger_accounts, public\.ledger_entries, public\.ledger_postings to authenticated/i
  );
  assert.doesNotMatch(
    foundation,
    /grant[^;]*insert[^;]*public\.ledger_(accounts|entries|postings)/i
  );
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
    'ledger_postings'
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
