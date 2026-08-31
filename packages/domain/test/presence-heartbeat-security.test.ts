import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260831150500_rate_limit_presence_heartbeats.sql',
  'utf8'
);

test('presence heartbeat remains authenticated-only and fail-closed', () => {
  assert.match(migration, /viewer uuid := auth\.uid\(\)/i);
  assert.match(migration, /if not public\.current_user_can_enter\(\)/i);
  assert.match(migration, /revoke execute on function public\.heartbeat_presence\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.heartbeat_presence\(\) to authenticated/i);
});

test('presence heartbeat suppresses rapid repeat writes using server time', () => {
  assert.match(migration, /seen_at timestamptz := now\(\)/i);
  assert.match(migration, /previous_seen_at >= seen_at - interval '30 seconds'/i);
  assert.match(migration, /return previous_seen_at/i);
  assert.match(migration, /on conflict \(user_id\)[\s\S]*last_seen_at = excluded\.last_seen_at/i);
});
