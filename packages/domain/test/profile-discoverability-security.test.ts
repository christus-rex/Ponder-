import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260831125327_internalize_profile_discoverability.sql',
  'utf8'
);

test('profile visibility becomes server-derived row state for RLS', () => {
  assert.match(
    migration,
    /add column if not exists is_discoverable boolean not null default false/i
  );
  assert.match(
    migration,
    /new\.is_discoverable :=[\s\S]*onboarding_completed_at is not null[\s\S]*account_status = 'active'/i
  );
  assert.match(
    migration,
    /after insert or update of account_status on public\.user_access/i
  );
  assert.match(
    migration,
    /active profiles are discoverable[\s\S]*or is_discoverable/i
  );
  assert.doesNotMatch(
    migration,
    /active profiles are discoverable[\s\S]*profile_is_discoverable\(id\)/i
  );
});

test('clients cannot bypass derived discoverability through a direct RPC probe', () => {
  assert.match(
    migration,
    /revoke execute on function public\.profile_is_discoverable\(uuid\)[\s\S]*from public, anon, authenticated/i
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.profile_is_discoverable\(uuid\)[\s\S]*to authenticated/i
  );
});

test('discoverability synchronization triggers are not callable as client RPCs', () => {
  for (const functionName of [
    'sync_profile_discoverability',
    'sync_profile_discoverability_from_access'
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke execute on function public\\.${functionName}\\(\\)[\\s\\S]*from public, anon, authenticated`,
        'i'
      )
    );
  }
});
