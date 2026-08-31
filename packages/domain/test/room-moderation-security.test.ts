import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const moderation = readFileSync(
  'supabase/migrations/20260831055500_room_moderation_audit.sql',
  'utf8'
);

test('moderation audit data is server-owned and protected by RLS', () => {
  assert.match(
    moderation,
    /alter table public\.room_moderation_actions enable row level security/i
  );
  assert.match(
    moderation,
    /revoke all on public\.room_moderation_actions from public, anon, authenticated/i
  );
  assert.doesNotMatch(
    moderation,
    /grant[^;]*(select|insert|update|delete)[^;]*room_moderation_actions[^;]*authenticated/i
  );
});

test('moderation closure is atomic, role-checked, and server-only', () => {
  assert.match(
    moderation,
    /create or replace function public\.moderation_close_live_room/i
  );
  assert.match(
    moderation,
    /account_status = 'active'[\s\S]*role in \('moderator', 'admin'\)/i
  );
  assert.match(
    moderation,
    /update public\.rooms[\s\S]*set status = 'closed'[\s\S]*insert into public\.room_moderation_actions/i
  );
  assert.match(
    moderation,
    /revoke execute on function public\.moderation_close_live_room\(uuid, uuid, public\.app_role, text\)[\s\S]*from public, anon, authenticated/i
  );
  assert.match(
    moderation,
    /grant execute on function public\.moderation_close_live_room\(uuid, uuid, public\.app_role, text\)[\s\S]*to service_role/i
  );
});

test('moderation reason and actor role are bounded at the database boundary', () => {
  assert.match(
    moderation,
    /room_moderation_reason_length check \(char_length\(reason\) between 3 and 500\)/i
  );
  assert.match(
    moderation,
    /room_moderation_actor_role check \(actor_role in \('moderator', 'admin'\)\)/i
  );
});
