import { describe, expect, it } from "vitest";
import {
  closeBackendOwnedLiveRoom,
  createBackendOwnedLiveRoom,
  moderationCloseBackendOwnedLiveRoom,
  type LiveRoomLifecycleStore,
} from "./liveRoomLifecycle";
import type {
  RealtimeKitMeetingControlPlane,
  RoomMediaProvisioningStore,
} from "./roomMediaProvisioning";

function fakes(options?: {
  failOpen?: boolean;
  failDeactivate?: boolean;
  existingMeetingId?: string | null;
}) {
  const events: string[] = [];
  let mapping = options?.existingMeetingId ?? null;

  const store: LiveRoomLifecycleStore = {
    async createClosedRoom(input) {
      events.push(`db:create:${input.createdBy}:${input.title}:closed`);
      return { id: "room-1", title: input.title };
    },
    async markRoomOpen(roomId, createdBy) {
      events.push(`db:open:${roomId}:${createdBy}`);
      if (options?.failOpen) throw new Error("open failed");
    },
    async markRoomClosed(roomId, createdBy) {
      events.push(`db:close:${roomId}:${createdBy}`);
    },
    async moderationCloseRoom(input) {
      events.push(
        `db:moderation-close:${input.roomId}:${input.actorId}:${input.actorRole}:${input.reason}`,
      );
      return { actionId: 42 };
    },
  };

  const mediaStore: RoomMediaProvisioningStore = {
    async findMeetingId() {
      return mapping;
    },
    async tryCreateMapping(_roomId, meetingId) {
      mapping = meetingId;
      events.push(`db:map:${meetingId}`);
      return "created";
    },
  };

  const controlPlane: RealtimeKitMeetingControlPlane = {
    async createMeeting({ roomId }) {
      events.push(`provider:create:${roomId}`);
      return { meetingId: "meeting-1" };
    },
    async setMeetingStatus(meetingId, status) {
      events.push(`provider:${status}:${meetingId}`);
      if (status === "INACTIVE" && options?.failDeactivate) {
        throw new Error("deactivate failed");
      }
    },
  };

  return { store, mediaStore, controlPlane, events };
}

describe("createBackendOwnedLiveRoom", () => {
  it("creates the room closed, provisions media, then opens it", async () => {
    const { store, mediaStore, controlPlane, events } = fakes();
    await expect(
      createBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        createdBy: "user-1",
        title: "Room title",
      }),
    ).resolves.toEqual({ roomId: "room-1", status: "open" });
    expect(events).toEqual([
      "db:create:user-1:Room title:closed",
      "provider:create:room-1",
      "db:map:meeting-1",
      "db:open:room-1:user-1",
    ]);
  });

  it("never opens a room when media provisioning fails", async () => {
    const { store, mediaStore, events } = fakes();
    const controlPlane: RealtimeKitMeetingControlPlane = {
      async createMeeting() {
        events.push("provider:create:failed");
        throw new Error("provider unavailable");
      },
      async setMeetingStatus() {},
    };
    await expect(
      createBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        createdBy: "user-1",
        title: "Room title",
      }),
    ).rejects.toThrow("provider unavailable");
    expect(events).toEqual([
      "db:create:user-1:Room title:closed",
      "provider:create:failed",
    ]);
  });

  it("deactivates media if final room activation fails", async () => {
    const { store, mediaStore, controlPlane, events } = fakes({ failOpen: true });
    await expect(
      createBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        createdBy: "user-1",
        title: "Room title",
      }),
    ).rejects.toThrow("open failed");
    expect(events).toEqual([
      "db:create:user-1:Room title:closed",
      "provider:create:room-1",
      "db:map:meeting-1",
      "db:open:room-1:user-1",
      "provider:INACTIVE:meeting-1",
    ]);
  });

  it("surfaces cleanup failure without claiming the room opened", async () => {
    const { store, mediaStore, controlPlane } = fakes({
      failOpen: true,
      failDeactivate: true,
    });
    await expect(
      createBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        createdBy: "user-1",
        title: "Room title",
      }),
    ).rejects.toThrow("provider cleanup is required");
  });

  it("validates room metadata before creating a lifecycle record", async () => {
    const { store, mediaStore, controlPlane, events } = fakes();
    await expect(
      createBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        createdBy: "user-1",
        title: "x",
      }),
    ).rejects.toThrow("between 3 and 100");
    await expect(
      createBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        createdBy: "user-1",
        title: "Valid room",
        maxParticipants: 25,
      }),
    ).rejects.toThrow("between 2 and 24");
    expect(events).toEqual([]);
  });
});

describe("closeBackendOwnedLiveRoom", () => {
  it("closes Ponder authority before deactivating provider media", async () => {
    const { store, mediaStore, controlPlane, events } = fakes({
      existingMeetingId: "meeting-1",
    });
    await expect(
      closeBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        roomId: "room-1",
        createdBy: "user-1",
      }),
    ).resolves.toEqual({ roomId: "room-1", status: "closed" });
    expect(events).toEqual([
      "db:close:room-1:user-1",
      "provider:INACTIVE:meeting-1",
    ]);
  });

  it("keeps Ponder closed even when provider deactivation fails", async () => {
    const { store, mediaStore, controlPlane, events } = fakes({
      existingMeetingId: "meeting-1",
      failDeactivate: true,
    });
    await expect(
      closeBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        roomId: "room-1",
        createdBy: "user-1",
      }),
    ).rejects.toThrow("deactivate failed");
    expect(events[0]).toBe("db:close:room-1:user-1");
  });
});

describe("moderationCloseBackendOwnedLiveRoom", () => {
  it("writes the audited authoritative close before provider cleanup", async () => {
    const { store, mediaStore, controlPlane, events } = fakes({
      existingMeetingId: "meeting-1",
    });
    await expect(
      moderationCloseBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        roomId: "room-1",
        actorId: "mod-1",
        actorRole: "moderator",
        reason: "Policy violation",
      }),
    ).resolves.toEqual({ roomId: "room-1", status: "closed", actionId: 42 });
    expect(events).toEqual([
      "db:moderation-close:room-1:mod-1:moderator:Policy violation",
      "provider:INACTIVE:meeting-1",
    ]);
  });

  it("leaves the audited Ponder close authoritative if provider cleanup fails", async () => {
    const { store, mediaStore, controlPlane, events } = fakes({
      existingMeetingId: "meeting-1",
      failDeactivate: true,
    });
    await expect(
      moderationCloseBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        roomId: "room-1",
        actorId: "admin-1",
        actorRole: "admin",
        reason: "Safety response",
      }),
    ).rejects.toThrow("deactivate failed");
    expect(events[0]).toBe(
      "db:moderation-close:room-1:admin-1:admin:Safety response",
    );
  });

  it("rejects non-moderation roles and invalid reasons before touching state", async () => {
    const { store, mediaStore, controlPlane, events } = fakes();
    await expect(
      moderationCloseBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        roomId: "room-1",
        actorId: "user-1",
        actorRole: "member" as "moderator",
        reason: "Policy violation",
      }),
    ).rejects.toThrow("moderator or admin");
    await expect(
      moderationCloseBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        roomId: "room-1",
        actorId: "mod-1",
        actorRole: "moderator",
        reason: "x",
      }),
    ).rejects.toThrow("between 3 and 500");
    expect(events).toEqual([]);
  });
});
