import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseRoomMediaProvisioningStore,
  deactivateRealtimeKitMeetingForRoom,
  ensureRealtimeKitMeetingProvisioned,
  type RealtimeKitMeetingControlPlane,
  type RoomMediaProvisioningStore,
} from "./roomMediaProvisioning";

function fakeStore(initialMeetingId: string | null = null) {
  let meetingId = initialMeetingId;
  let createResult: "created" | "conflict" = "created";
  let createError: Error | null = null;

  const store: RoomMediaProvisioningStore = {
    async findMeetingId() {
      return meetingId;
    },
    async tryCreateMapping(_roomId, candidateMeetingId) {
      if (createError) throw createError;
      if (createResult === "created") meetingId = candidateMeetingId;
      return createResult;
    },
  };

  return {
    store,
    setMeetingId(value: string | null) {
      meetingId = value;
    },
    setCreateResult(value: "created" | "conflict") {
      createResult = value;
    },
    setCreateError(error: Error) {
      createError = error;
    },
  };
}

function fakeControlPlane(options?: {
  createdMeetingId?: string;
  failStatusFor?: string;
}) {
  const calls: string[] = [];
  const controlPlane: RealtimeKitMeetingControlPlane = {
    async createMeeting({ roomId, title }) {
      calls.push(`create:${roomId}:${title}`);
      return { meetingId: options?.createdMeetingId ?? "meeting-new" };
    },
    async setMeetingStatus(meetingId, status) {
      calls.push(`status:${meetingId}:${status}`);
      if (options?.failStatusFor === meetingId) {
        throw new Error("provider unavailable");
      }
    },
  };
  return { controlPlane, calls };
}

describe("ensureRealtimeKitMeetingProvisioned", () => {
  it("reactivates and reuses an existing backend mapping", async () => {
    const { store } = fakeStore("meeting-existing");
    const { controlPlane, calls } = fakeControlPlane();

    await expect(
      ensureRealtimeKitMeetingProvisioned(store, controlPlane, {
        roomId: "room-1",
        title: "Existing room",
      }),
    ).resolves.toEqual({ meetingId: "meeting-existing", created: false });

    expect(calls).toEqual(["status:meeting-existing:ACTIVE"]);
  });

  it("creates and persists a meeting when no mapping exists", async () => {
    const { store } = fakeStore();
    const { controlPlane, calls } = fakeControlPlane({
      createdMeetingId: "meeting-created",
    });

    await expect(
      ensureRealtimeKitMeetingProvisioned(store, controlPlane, {
        roomId: "room-2",
        title: "New room",
      }),
    ).resolves.toEqual({ meetingId: "meeting-created", created: true });

    expect(calls).toEqual(["create:room-2:New room"]);
  });

  it("compensates the losing provider meeting when another request wins the mapping race", async () => {
    const state = fakeStore();
    state.setCreateResult("conflict");
    const { controlPlane, calls } = fakeControlPlane({
      createdMeetingId: "meeting-loser",
    });

    let reads = 0;
    const racingStore: RoomMediaProvisioningStore = {
      async findMeetingId() {
        reads += 1;
        return reads === 1 ? null : "meeting-winner";
      },
      tryCreateMapping: state.store.tryCreateMapping,
    };

    await expect(
      ensureRealtimeKitMeetingProvisioned(racingStore, controlPlane, {
        roomId: "room-3",
        title: "Race room",
      }),
    ).resolves.toEqual({ meetingId: "meeting-winner", created: false });

    expect(calls).toEqual([
      "create:room-3:Race room",
      "status:meeting-loser:INACTIVE",
      "status:meeting-winner:ACTIVE",
    ]);
  });

  it("disables a created meeting when the provider returns an unmappable ID", async () => {
    const { store } = fakeStore();
    const invalidMeetingId = "x".repeat(201);
    const { controlPlane, calls } = fakeControlPlane({
      createdMeetingId: invalidMeetingId,
    });

    await expect(
      ensureRealtimeKitMeetingProvisioned(store, controlPlane, {
        roomId: "room-invalid-provider-id",
        title: "Invalid provider ID",
      }),
    ).rejects.toThrow("invalid meeting ID");

    expect(calls).toEqual([
      "create:room-invalid-provider-id:Invalid provider ID",
      `status:${invalidMeetingId}:INACTIVE`,
    ]);
  });

  it("disables a newly created meeting when mapping persistence fails", async () => {
    const state = fakeStore();
    state.setCreateError(new Error("database unavailable"));
    const { controlPlane, calls } = fakeControlPlane({
      createdMeetingId: "meeting-orphan",
    });

    await expect(
      ensureRealtimeKitMeetingProvisioned(state.store, controlPlane, {
        roomId: "room-4",
        title: "Failure room",
      }),
    ).rejects.toThrow("database unavailable");

    expect(calls).toEqual([
      "create:room-4:Failure room",
      "status:meeting-orphan:INACTIVE",
    ]);
  });

  it("surfaces compensation failure instead of silently leaving an active orphan", async () => {
    const state = fakeStore();
    state.setCreateError(new Error("database unavailable"));
    const { controlPlane } = fakeControlPlane({
      createdMeetingId: "meeting-orphan",
      failStatusFor: "meeting-orphan",
    });

    await expect(
      ensureRealtimeKitMeetingProvisioned(state.store, controlPlane, {
        roomId: "room-5",
        title: "Cleanup failure",
      }),
    ).rejects.toThrow("manual cleanup required");
  });

  it("does not mutate provider state when a uniqueness conflict has no same-room winner", async () => {
    const state = fakeStore();
    state.setCreateResult("conflict");
    const { controlPlane, calls } = fakeControlPlane({
      createdMeetingId: "meeting-ambiguous",
    });

    await expect(
      ensureRealtimeKitMeetingProvisioned(state.store, controlPlane, {
        roomId: "room-6",
        title: "Ambiguous conflict",
      }),
    ).rejects.toThrow("manual reconciliation");

    expect(calls).toEqual(["create:room-6:Ambiguous conflict"]);
  });

  it("rejects invalid room metadata before touching the provider", async () => {
    const { store } = fakeStore();
    const { controlPlane, calls } = fakeControlPlane();

    await expect(
      ensureRealtimeKitMeetingProvisioned(store, controlPlane, {
        roomId: " ",
        title: "Valid title",
      }),
    ).rejects.toThrow("Room ID is required");

    await expect(
      ensureRealtimeKitMeetingProvisioned(store, controlPlane, {
        roomId: "room-7",
        title: "x",
      }),
    ).rejects.toThrow("between 3 and 100");

    expect(calls).toEqual([]);
  });
});

describe("deactivateRealtimeKitMeetingForRoom", () => {
  it("is a no-op when no mapping exists", async () => {
    const { store } = fakeStore();
    const { controlPlane, calls } = fakeControlPlane();

    await expect(
      deactivateRealtimeKitMeetingForRoom(store, controlPlane, "room-8"),
    ).resolves.toBe(false);
    expect(calls).toEqual([]);
  });

  it("disables the backend-owned meeting without deleting its mapping", async () => {
    const { store } = fakeStore("meeting-close");
    const { controlPlane, calls } = fakeControlPlane();

    await expect(
      deactivateRealtimeKitMeetingForRoom(store, controlPlane, "room-9"),
    ).resolves.toBe(true);
    expect(calls).toEqual(["status:meeting-close:INACTIVE"]);
  });
});


describe("createSupabaseRoomMediaProvisioningStore", () => {
  it("scopes mapping reads to the requested room and realtimekit provider", async () => {
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
        return {
          data: { provider_meeting_id: " meeting-db " },
          error: null,
        };
      },
    };
    const client = {
      from(table: string) {
        expect(table).toBe("room_media_provider_mappings");
        return query;
      },
    } as unknown as SupabaseClient;

    const store = createSupabaseRoomMediaProvisioningStore(client);
    await expect(store.findMeetingId("room-db")).resolves.toBe("meeting-db");
    expect(filters).toEqual([
      ["room_id", "room-db"],
      ["provider", "realtimekit"],
    ]);
  });

  it("classifies only PostgreSQL uniqueness failures as provisioning conflicts", async () => {
    const inserted: unknown[] = [];
    const client = {
      from(table: string) {
        expect(table).toBe("room_media_provider_mappings");
        return {
          async insert(value: unknown) {
            inserted.push(value);
            return { error: { code: "23505" } };
          },
        };
      },
    } as unknown as SupabaseClient;

    const store = createSupabaseRoomMediaProvisioningStore(client);
    await expect(
      store.tryCreateMapping("room-conflict", "meeting-conflict"),
    ).resolves.toBe("conflict");
    expect(inserted).toEqual([
      {
        room_id: "room-conflict",
        provider: "realtimekit",
        provider_meeting_id: "meeting-conflict",
      },
    ]);
  });

  it("fails closed on non-uniqueness persistence errors", async () => {
    const client = {
      from() {
        return {
          async insert() {
            return { error: { code: "42501", message: "permission denied" } };
          },
        };
      },
    } as unknown as SupabaseClient;

    const store = createSupabaseRoomMediaProvisioningStore(client);
    await expect(
      store.tryCreateMapping("room-error", "meeting-error"),
    ).rejects.toThrow("Unable to persist media provider provisioning state");
  });
});
