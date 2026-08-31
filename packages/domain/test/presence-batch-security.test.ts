import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const presenceScope = readFileSync(
  'supabase/migrations/20260831130313_presence_batch_scope.sql',
  'utf8'
);
const serverOwnership = readFileSync(
  'supabase/migrations/20260831131030_server_owned_discovery_presence.sql',
  'utf8'
);
const discoverPage = readFileSync('app/discover/page.tsx', 'utf8');
const adminClient = readFileSync('lib/supabase/admin.ts', 'utf8');

test('arbitrary candidate-array presence lookup is retired', () => {
  assert.match(
    presenceScope,
    /revoke execute on function public\.presence_for_candidates\(uuid\[\]\)[\s\S]*from public, anon, authenticated/i
  );
  assert.match(
    presenceScope,
    /drop function public\.presence_for_candidates\(uuid\[\]\)/i
  );
  assert.doesNotMatch(discoverPage, /presence_for_candidates/i);
});

test('batch presence is bounded to ownership and freshness', () => {
  assert.match(
    serverOwnership,
    /where batch\.id = p_batch_id[\s\S]*batch\.viewer_id = p_viewer_id/i
  );
  assert.match(
    serverOwnership,
    /batch_created_at < now\(\) - interval '10 minutes'/i
  );
  assert.match(
    serverOwnership,
    /from public\.discovery_impressions impression[\s\S]*impression\.batch_id = p_batch_id[\s\S]*impression\.viewer_id = p_viewer_id/i
  );
});

test('presence still honors discoverability and opt-in status', () => {
  assert.match(
    serverOwnership,
    /preferences\.show_online_status[\s\S]*presence\.last_seen_at >= now\(\) - interval '2 minutes'/i
  );
  assert.match(
    serverOwnership,
    /public\.profile_is_discoverable\(impression\.candidate_id\)/i
  );
});

test('browser roles cannot mint discovery batches or query batch presence', () => {
  for (const signature of [
    'record_resonance_impression_batch_for_user\\(uuid, uuid\\[\\], smallint\\[\\], text\\[\\]\\)',
    'presence_for_discovery_batch_for_user\\(uuid, uuid\\)'
  ]) {
    assert.match(
      serverOwnership,
      new RegExp(
        `revoke execute on function public\\.${signature}[\\s\\S]*from public, anon, authenticated`,
        'i'
      )
    );
    assert.match(
      serverOwnership,
      new RegExp(
        `grant execute on function public\\.${signature}[\\s\\S]*to service_role`,
        'i'
      )
    );
  }

  assert.match(
    serverOwnership,
    /drop function public\.record_resonance_impression_batch\(uuid\[\], smallint\[\], text\[\]\)/i
  );
  assert.match(
    serverOwnership,
    /drop function public\.presence_for_discovery_batch\(uuid\)/i
  );
});

test('server-owned batch issuance rechecks viewer eligibility and candidate bounds', () => {
  assert.match(
    serverOwnership,
    /record_resonance_impression_batch_for_user[\s\S]*ua\.id = p_viewer_id[\s\S]*account_status = 'active'/i
  );
  assert.match(serverOwnership, /candidate_count < 1 or candidate_count > 12/i);
  assert.match(serverOwnership, /p_viewer_id = any\(p_candidate_ids\)/i);
  assert.match(
    serverOwnership,
    /All discovery candidates must be active, onboarded profiles/i
  );
});

test('discover uses a server-only service-role client for batch and presence orchestration', () => {
  assert.match(adminClient, /import "server-only"/i);
  assert.match(adminClient, /SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(discoverPage, /createAdminClient\(\)/i);
  assert.match(discoverPage, /record_resonance_impression_batch_for_user/i);
  assert.match(discoverPage, /presence_for_discovery_batch_for_user/i);
  assert.doesNotMatch(
    discoverPage,
    /supabase\.rpc\("record_resonance_impression_batch"/i
  );
  assert.doesNotMatch(
    discoverPage,
    /supabase\.rpc\("presence_for_discovery_batch"/i
  );
});

test('presence remains display-only and does not influence resonance ranking', () => {
  assert.match(discoverPage, /rankResonance[\s\S]*availableNow: false/i);
  assert.match(discoverPage, /rankedPeopleWithPresence = rankedPeople\.map/i);
  assert.match(
    discoverPage,
    /Opt-in live availability is shown only after the discovery batch is issued; it does not change ranking/i
  );
});
