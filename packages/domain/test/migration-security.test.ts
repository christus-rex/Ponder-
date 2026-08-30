import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync('supabase/migrations/0001_core.sql', 'utf8');

function policyAllowsInsert(table: string): boolean {
  const pattern = new RegExp(`create\\s+policy[\\s\\S]*?on\\s+public\\.${table}\\s+for\\s+insert`, 'i');
  return pattern.test(sql);
}

test('wallet ledger is guarded by an immutability trigger', () => {
  assert.match(sql, /create trigger wallet_ledger_immutable before update or delete on public\.wallet_ledger/i);
});

test('sensitive settlement and moderation tables do not allow direct client inserts', () => {
  for (const table of ['wallet_ledger', 'gift_events', 'account_controls', 'room_participants', 'messages']) {
    assert.equal(policyAllowsInsert(table), false, `${table} unexpectedly has a client insert policy`);
  }
});

test('room creation is constrained to a World owned by the host', () => {
  assert.match(sql, /live_rooms_insert_host[\s\S]*owner_user_id\s*=\s*auth\.uid\(\)/i);
});

test('self-service World membership is limited to published public Worlds', () => {
  assert.match(sql, /world_members_join_self[\s\S]*published_at is not null[\s\S]*visibility = 'public'/i);
});


test('18+ eligibility is enforced at the database boundary', () => {
  assert.match(sql, /age_attestations_require_adult/i);
  assert.match(sql, /current_date\s*-\s*interval '18 years'/i);
});

test('new reports must enter moderation as open', () => {
  assert.match(sql, /reports_insert_own[\s\S]*status\s*=\s*'open'/i);
});
