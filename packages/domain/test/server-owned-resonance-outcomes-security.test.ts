import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260831132500_server_owned_resonance_outcomes.sql',
  'utf8'
);

test('browser roles cannot write resonance outcomes directly', () => {
  assert.match(migration, /revoke execute on function public\.record_resonance_outcome\(uuid, uuid, text, uuid\)[\s\S]*authenticated/i);
  assert.match(migration, /drop function public\.record_resonance_outcome\(uuid, uuid, text, uuid\)/i);
  assert.match(migration, /record_resonance_outcome_for_user/i);
  assert.match(migration, /grant execute on function public\.record_resonance_outcome_for_user[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.record_resonance_outcome_for_user[\s\S]*to authenticated/i);
});

test('backend outcome writer rechecks eligibility and impression ownership', () => {
  assert.match(migration, /account_status = 'active'/i);
  assert.match(migration, /date_of_birth[\s\S]*18 years/i);
  assert.match(migration, /terms_accepted_at is not null/i);
  assert.match(migration, /onboarding_completed_at is not null/i);
  assert.match(migration, /di\.batch_id = p_batch_id[\s\S]*di\.candidate_id = p_candidate_id/i);
  assert.match(migration, /stored_viewer <> p_viewer_id/i);
});
