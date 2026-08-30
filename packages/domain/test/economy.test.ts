import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDemoGiftTransfer, computeWalletBalance } from '../src/economy.ts';
import type { GiftCatalogItem, LedgerEntry } from '../src/models.ts';

const gift: GiftCatalogItem = { id: 'gift-1', sku: 'spark-100', name: 'Spark', amount: 100, currency: 'PONDER_DEMO', active: true };

function transfer(overrides: Partial<Parameters<typeof buildDemoGiftTransfer>[0]> = {}) {
  return buildDemoGiftTransfer({
    correlationId: 'corr-1', giftEventId: 'event-1', senderLedgerEntryId: 'ledger-1', creatorLedgerEntryId: 'ledger-2',
    senderUserId: 'sender-1', creatorUserId: 'creator-1', roomId: 'room-1', gift, availableBalance: 500,
    occurredAt: '2026-08-30T18:00:00.000Z', ...overrides
  });
}

test('wallet balance derives from ledger entries', () => {
  const entries: LedgerEntry[] = [
    { id: '1', accountUserId: 'u', correlationId: 'a', leg: 'adjustment', direction: 'credit', amount: 500, currency: 'PONDER_DEMO', reason: 'grant', occurredAt: 'now' },
    { id: '2', accountUserId: 'u', correlationId: 'b', leg: 'sender_debit', direction: 'debit', amount: 125, currency: 'PONDER_DEMO', reason: 'gift', occurredAt: 'now' }
  ];
  assert.equal(computeWalletBalance(entries), 375);
});

test('gift transfer produces balanced debit and credit legs', () => {
  const result = transfer();
  assert.equal(result.giftEvent.amount, 100);
  assert.equal(computeWalletBalance(result.ledgerEntries), 0);
  assert.deepEqual(result.ledgerEntries.map((entry) => entry.leg), ['sender_debit', 'creator_credit']);
});

test('self-gifting is rejected', () => assert.throws(() => transfer({ creatorUserId: 'sender-1' }), /Self-gifting/));
test('insufficient balance is rejected', () => assert.throws(() => transfer({ availableBalance: 99 }), /Insufficient balance/));
test('non-positive gift amounts are rejected', () => assert.throws(() => transfer({ gift: { ...gift, amount: 0 } }), /positive safe integer/));
