import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRealtimeKitMeetingId } from "./roomMediaProviderMapping";

function fakeClient(result: { data: unknown; error: unknown }) {
  const filters: Array<[string, string]> = [];
  const query = {
    select() {
      return query;
    },
    eq(column: string, value: string) {
      filters.push([column, value]);
      return query;
    },
    async maybeSingle() {
      return result;
    },
  };

  const client = {
    from(table: string) {
      expect(table).toBe("room_media_provider_mappings");
      return query;
    },
  } as unknown as SupabaseClient;

  return { client, filters };
}

describe("resolveRealtimeKitMeetingId", () => {
  it("resolves only the realtimekit mapping for the requested room", async () => {
    const { client, filters } = fakeClient({
      data: { provider_meeting_id: " meeting-123 " },
      error: null,
    });

    await expect(resolveRealtimeKitMeetingId(client, "room-1")).resolves.toBe(
      "meeting-123",
    );
    expect(filters).toEqual([
      ["room_id", "room-1"],
      ["provider", "realtimekit"],
    ]);
  });

  it("fails closed when no backend mapping exists", async () => {
    const { client } = fakeClient({ data: null, error: null });
    await expect(resolveRealtimeKitMeetingId(client, "room-1")).rejects.toThrow(
      "RealtimeKit meeting mapping is missing",
    );
  });

  it("does not leak database failures", async () => {
    const { client } = fakeClient({ data: null, error: { message: "internal detail" } });
    await expect(resolveRealtimeKitMeetingId(client, "room-1")).rejects.toThrow(
      "Unable to resolve backend media provider mapping",
    );
  });

  it("rejects an empty room id before querying", async () => {
    const { client } = fakeClient({ data: null, error: null });
    await expect(resolveRealtimeKitMeetingId(client, "   ")).rejects.toThrow(
      "Room ID is required",
    );
  });
});
