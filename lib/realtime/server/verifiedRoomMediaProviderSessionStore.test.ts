import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createVerifiedSupabaseRoomMediaProviderSessionStore } from "./verifiedRoomMediaProviderSessionStore";

function adminClientReturning(
  data: { id: string } | null,
  error: { message: string } | null = null,
): SupabaseClient {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.update = chain;
  builder.eq = chain;
  builder.is = chain;
  builder.select = chain;
  builder.maybeSingle = async () => ({ data, error });

  return {
    from() {
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("verified provider media reconciliation scheduling", () => {
  it("resolves only when an unresolved handle was actually updated", async () => {
    const store = createVerifiedSupabaseRoomMediaProviderSessionStore(
      adminClientReturning({ id: "session-1" }),
    );

    await expect(
      store.requestReconciliation?.("room-1", "user-1", "participant-1"),
    ).resolves.toBeUndefined();
  });

  it("rejects a zero-row update instead of claiming reconciliation is durable", async () => {
    const store = createVerifiedSupabaseRoomMediaProviderSessionStore(
      adminClientReturning(null),
    );

    await expect(
      store.requestReconciliation?.("room-1", "user-1", "participant-missing"),
    ).rejects.toThrow("Unable to verify provider media reconciliation was scheduled");
  });

  it("rejects database errors while scheduling reconciliation", async () => {
    const store = createVerifiedSupabaseRoomMediaProviderSessionStore(
      adminClientReturning(null, { message: "database unavailable" }),
    );

    await expect(
      store.requestReconciliation?.("room-1", "user-1", "participant-1"),
    ).rejects.toThrow("Unable to verify provider media reconciliation was scheduled");
  });
});
