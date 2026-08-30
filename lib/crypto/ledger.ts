export type LedgerPosting = {
  accountId: string;
  direction: "debit" | "credit";
  amountMinor: bigint;
};

export type JournalEntry = {
  idempotencyKey: string;
  reference: string;
  currency: "USDC";
  postings: LedgerPosting[];
};

export type TipJournalInput = {
  idempotencyKey: string;
  payerAccountId: string;
  creatorAccountId: string;
  platformAccountId: string;
  amountMinor: bigint;
  platformFeeBps: number;
};

export function assertBalanced(entry: JournalEntry): void {
  const totals = entry.postings.reduce(
    (acc, posting) => {
      if (posting.amountMinor < 0n) {
        throw new Error("Ledger postings cannot be negative.");
      }

      acc[posting.direction] += posting.amountMinor;
      return acc;
    },
    { debit: 0n, credit: 0n },
  );

  if (totals.debit !== totals.credit) {
    throw new Error(
      `Unbalanced journal entry: debit=${totals.debit} credit=${totals.credit}`,
    );
  }
}

export function createTipJournal(input: TipJournalInput): JournalEntry {
  if (!input.idempotencyKey.trim()) {
    throw new Error("An idempotency key is required.");
  }

  if (input.amountMinor <= 0n) {
    throw new Error("Tip amount must be greater than zero.");
  }

  if (!Number.isInteger(input.platformFeeBps) || input.platformFeeBps < 0 || input.platformFeeBps > 10_000) {
    throw new Error("Platform fee must be an integer between 0 and 10000 bps.");
  }

  const fee = (input.amountMinor * BigInt(input.platformFeeBps)) / 10_000n;
  const creatorNet = input.amountMinor - fee;

  const entry: JournalEntry = {
    idempotencyKey: input.idempotencyKey,
    reference: "creator_tip",
    currency: "USDC",
    postings: [
      {
        accountId: input.payerAccountId,
        direction: "debit",
        amountMinor: input.amountMinor,
      },
      {
        accountId: input.creatorAccountId,
        direction: "credit",
        amountMinor: creatorNet,
      },
      {
        accountId: input.platformAccountId,
        direction: "credit",
        amountMinor: fee,
      },
    ],
  };

  assertBalanced(entry);
  return entry;
}
