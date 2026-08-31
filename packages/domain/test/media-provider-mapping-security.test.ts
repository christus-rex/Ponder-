import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260831093418_room_media_provider_mappings.sql',
  'utf8'
);

test('media provider mapping is protected by RLS with no browser grants', () => {
  assert.match(
    migration,
    /alter table public\.room_media_provider_mappings enable row level security/i
  );
  assert.match(
    migration,
    /revoke all on table public\.room_media_provider_mappings from anon, authenticated/i
  );
  assert.doesNotMatch(
    migration,
    /create policy[\s\S]*room_media_provider_mappings/i
  );
});

test('only service_role receives explicit provider mapping privileges', () => {
  assert.match(
    migration,
    /grant select, insert, update, delete on table public\.room_media_provider_mappings to service_role/i
  );
  assert.doesNotMatch(
    migration,
    /grant[^;]*room_media_provider_mappings[^;]*to (anon|authenticated)/i
  );
});

test('provider mapping supports only realtimekit and bounded meeting ids', () => {
  assert.match(migration, /provider = 'realtimekit'/i);
  assert.match(
    migration,
    /char_length\(provider_meeting_id\) between 1 and 200/i
  );
  assert.match(migration, /unique \(provider, provider_meeting_id\)/i);
});
