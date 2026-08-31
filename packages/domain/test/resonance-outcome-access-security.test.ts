import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260831120219_restrict_resonance_outcomes_to_active_users.sql',
  'utf8'
);

test('resonance outcome RPC re-checks full app access on every write', () => {
  assert.match(
    migration,
    /viewer uuid := auth\.uid\(\)/i
  );
  assert.match(
    migration,
    /if not public\.current_user_can_enter\(\) then[\s\S]*Full app access required/i
  );
});

test('resonance outcome RPC keeps its narrow authenticated-only grant', () => {
  assert.match(
    migration,
    /revoke execute on function public\.record_resonance_outcome\(uuid, uuid, text, uuid\)[\s\S]*from public, anon/i
  );
  assert.match(
    migration,
    /grant execute on function public\.record_resonance_outcome\(uuid, uuid, text, uuid\)[\s\S]*to authenticated/i
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.record_resonance_outcome\([^)]*\)[\s\S]*to (public|anon)/i
  );
});

test('resonance outcome RPC still binds writes to an owned impression', () => {
  assert.match(
    migration,
    /where di\.batch_id = p_batch_id[\s\S]*and di\.candidate_id = p_candidate_id/i
  );
  assert.match(
    migration,
    /stored_viewer is null or stored_viewer <> viewer/i
  );
});
