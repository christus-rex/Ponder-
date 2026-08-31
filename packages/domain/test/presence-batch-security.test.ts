import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260831130000_presence_batch_scope.sql',
  'utf8'
);
const discoverPage = readFileSync('app/discover/page.tsx', 'utf8');

test('arbitrary candidate-array presence lookup is retired', () => {
  assert.match(
    migration,
    /revoke execute on function public\.presence_for_candidates\(uuid\[\]\)[\s\S]*from public, anon, authenticated/i
  );
  assert.match(
    migration,
    /drop function public\.presence_for_candidates\(uuid\[\]\)/i
  );
  assert.doesNotMatch(discoverPage, /presence_for_candidates/i);
});

test('presence lookup is bound to an owned recent discovery batch', () => {
  assert.match(
    migration,
    /create or replace function public\.presence_for_discovery_batch\(p_batch_id uuid\)/i
  );
  assert.match(migration, /viewer uuid := auth\.uid\(\)/i);
  assert.match(migration, /current_user_can_enter\(\)/i);
  assert.match(
    migration,
    /where batch\.id = p_batch_id[\s\S]*batch\.viewer_id = viewer/i
  );
  assert.match(
    migration,
    /batch_created_at < now\(\) - interval '10 minutes'/i
  );
  assert.match(
    migration,
    /from public\.discovery_impressions impression[\s\S]*impression\.batch_id = p_batch_id[\s\S]*impression\.viewer_id = viewer/i
  );
});

test('batch-scoped presence still honors discoverability and opt-in status', () => {
  assert.match(
    migration,
    /preferences\.show_online_status[\s\S]*presence\.last_seen_at >= now\(\) - interval '2 minutes'/i
  );
  assert.match(
    migration,
    /public\.profile_is_discoverable\(impression\.candidate_id\)/i
  );
  assert.match(
    migration,
    /grant execute on function public\.presence_for_discovery_batch\(uuid\)[\s\S]*to authenticated/i
  );
});

test('discover issues the impression batch before requesting presence', () => {
  const batchCall = discoverPage.indexOf('record_resonance_impression_batch');
  const presenceCall = discoverPage.indexOf('presence_for_discovery_batch');

  assert.ok(batchCall >= 0, 'discovery batch RPC must be called');
  assert.ok(presenceCall > batchCall, 'presence must be requested only after the batch exists');
  assert.match(
    discoverPage,
    /presence_for_discovery_batch[\s\S]*p_batch_id: resonanceBatchId/i
  );
});

test('presence is display-only and does not influence resonance ranking', () => {
  assert.match(
    discoverPage,
    /availableNow: false,[\s\S]*rankResonance/i
  );
  assert.match(
    discoverPage,
    /rankedPeopleWithPresence = rankedPeople\.map/i
  );
  assert.match(
    discoverPage,
    /Opt-in live availability is shown only after the discovery batch is issued; it does not change ranking/i
  );
});
