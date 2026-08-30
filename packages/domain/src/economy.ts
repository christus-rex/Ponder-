import type { CorrelationId, GiftCatalogItem, GiftEvent, LedgerEntry, RoomId, UserId } from './models.ts';

export function computeWalletBalance(entries: readonly LedgerEntry[]): number {
  return entries.reduce((balance, entry) => {
    if (!Number.isSafeInteger(entry.amount) || entry.amount <= 0) throw new Error('Ledger amount must be a positive safe integer');
    return balance + (entry.direction === 'credit' ? entry.amount : -entry.amount);
  }, 0);
}

export interface DemoGiftTransferInput {
  correlationId: CorrelationId;
  giftEventId: string;
  senderLedgerEntryId: string;
  creatorLedgerEntryId: string;
  senderUserId: UserId;
  creatorUserId: UserId;
  roomId: RoomId;
  gift: GiftCatalogItem;
  availableBalance: number;
  occurredAt: string;
}

export interface DemoGiftTransfer {
  giftEvent: GiftEvent;
  ledgerEntries: readonly [LedgerEntry, LedgerEntry];
}

export function buildDemoGiftTransfer(input: DemoGiftTransferInput): DemoGiftTransfer {
  if (input.senderUserId === input.creatorUserId) throw new Error('Self-gifting is not allowed');
  if (!input.gift.active) throw new Error('Gift is inactive');
  if (input.gift.currency !== 'PONDER_DEMO') throw new Error('Unsupported demo currency');
  if (!Number.isSafeInteger(input.gift.amount) || input.gift.amount <= 0) throw new Error('Gift amount must be a positive safe integer');
  if (!Number.isSafeInteger(input.availableBalance) || input.availableBalance < input.gift.amount) throw new Error('Insufficient balance');

  const senderDebit: LedgerEntry = {
    id: input.senderLedgerEntryId, accountUserId: input.senderUserId, correlationId: input.correlationId,
    leg: 'sender_debit', direction: 'debit', amount: input.gift.amount, currency: 'PONDER_DEMO', reason: 'gift', occurredAt: input.occurredAt
  };
  const creatorCredit: LedgerEntry = {
    id: input.creatorLedgerEntryId, accountUserId: input.creatorUserId, correlationId: input.correlationId,
    leg: 'creator_credit', direction: 'credit', amount: input.gift.amount, currency: 'PONDER_DEMO', reason: 'gift', occurredAt: input.occurredAt
  };

  return {
    giftEvent: {
      id: input.giftEventId, correlationId: input.correlationId, roomId: input.roomId, giftCatalogItemId: input.gift.id,
      senderUserId: input.senderUserId, creatorUserId: input.creatorUserId, amount: input.gift.amount,
      currency: 'PONDER_DEMO', occurredAt: input.occurredAt
    },
    ledgerEntries: [senderDebit, creatorCredit]
  };
}
