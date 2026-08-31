import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260831142115_server_owned_profile_open_outcomes.sql',
  'utf8'
);

const personPage = readFileSync('app/people/[userId]/page.tsx', 'utf8');

test('browser roles cannot write generic resonance outcomes directly', () => {
  assert.match(
    migration,
    /revoke execute on function public\.record_resonance_outcome\(uuid, uuid, text, uuid\)[\s\S]*authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.record_resonance_outcome\(uuid, uuid, text, uuid\)[\s\S]*to authenticated/i,
  );
});

test('profile-open telemetry is exposed only to the service role', () => {
  assert.match(migration, /create or replace function public\.record_profile_opened_for_user/i);
  assert.match(
    migration,
    /revoke execute on function public\.record_profile_opened_for_user\(uuid, uuid, uuid\)[\s\S]*authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.record_profile_opened_for_user\(uuid, uuid, uuid\)[\s\S]*to service_role/i,
  );
});

test('backend profile-open writer rechecks eligibility, ownership, and freshness', () => {
  assert.match(migration, /account_status = 'active'/i);
  assert.match(migration, /date_of_birth[\s\S]*18 years/i);
  assert.match(migration, /terms_accepted_at is not null/i);
  assert.match(migration, /onboarding_completed_at is not null/i);
  assert.match(migration, /di\.viewer_id = p_viewer_id/i);
  assert.match(migration, /di\.candidate_id = p_candidate_id/i);
  assert.match(migration, /batch\.viewer_id = p_viewer_id/i);
  assert.match(migration, /batch\.created_at >= now\(\) - interval '10 minutes'/i);
});

test('profile page records profile-open telemetry through the server-only admin client', () => {
  assert.match(personPage, /createAdminClient/);
  assert.match(personPage, /record_profile_opened_for_user/);
  assert.doesNotMatch(personPage, /supabase\.rpc\("record_resonance_outcome"/);
});
