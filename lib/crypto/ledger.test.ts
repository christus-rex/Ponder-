import { describe, expect, it } from "vitest";
import { assertBalanced, createTipJournal } from "./ledger";

describe("Ponder ledger", () => {
  it("creates a balanced creator-tip journal", () => {
    const journal = createTipJournal({
      idempotencyKey: "tip_001",
      payerAccountId: "user:alice",
      creatorAccountId: "creator:bob",
      platformAccountId: "platform:ponder",
      amountMinor: 5_000_000n,
      platformFeeBps: 1_000,
    });

    expect(journal.postings).toEqual([
      {
        accountId: "user:alice",
        direction: "debit",
        amountMinor: 5_000_000n,
      },
      {
        accountId: "creator:bob",
        direction: "credit",
        amountMinor: 4_500_000n,
      },
      {
        accountId: "platform:ponder",
        direction: "credit",
        amountMinor: 500_000n,
      },
    ]);

    expect(() => assertBalanced(journal)).not.toThrow();
  });

  it("rejects invalid monetary inputs", () => {
    expect(() =>
      createTipJournal({
        idempotencyKey: "tip_002",
        payerAccountId: "user:alice",
        creatorAccountId: "creator:bob",
        platformAccountId: "platform:ponder",
        amountMinor: 0n,
        platformFeeBps: 1_000,
      }),
    ).toThrow("greater than zero");
  });
});
