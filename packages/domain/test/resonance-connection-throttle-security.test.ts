import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260831161000_throttle_resonance_connection_requests.sql',
  'utf8'
);

test('supplied discovery batches are viewer-owned, candidate-bound, and fresh', () => {
  assert.match(
    migration,
    /join public\.discovery_impressions impression[\s\S]*impression\.viewer_id = viewer[\s\S]*impression\.candidate_id = p_candidate_id/i,
  );
  assert.match(migration, /batch\.viewer_id = viewer/i);
  assert.match(migration, /batch_created_at < now\(\) - interval '10 minutes'/i);
});

test('new outbound connection creation is bounded and concurrency-safe', () => {
  assert.match(
    migration,
    /pg_advisory_xact_lock[\s\S]*hashtextextended\(viewer::text, 0\)/i,
  );
  assert.match(
    migration,
    /requester_id = viewer[\s\S]*created_at >= now\(\) - interval '10 minutes'/i,
  );
  assert.match(migration, /recent_outbound_count >= 20/i);
  assert.match(migration, /Too many new connection requests; try again later/i);
});

test('existing, inbound, and blocked connection semantics remain ahead of throttle admission', () => {
  const blocked = migration.indexOf("Connection is blocked");
  const existing = migration.indexOf("if outbound_status in");
  const inbound = migration.indexOf("if inbound_status = 'pending'");
  const throttle = migration.indexOf('pg_advisory_xact_lock');

  assert.ok(blocked >= 0 && blocked < throttle);
  assert.ok(existing >= 0 && existing < throttle);
  assert.ok(inbound >= 0 && inbound < throttle);
});

test('authenticated execution remains narrow and anonymous execution stays revoked', () => {
  assert.match(
    migration,
    /revoke execute on function public\.request_connection_from_resonance\(uuid, uuid\)[\s\S]*from public, anon/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.request_connection_from_resonance\(uuid, uuid\)[\s\S]*to authenticated/i,
  );
});
